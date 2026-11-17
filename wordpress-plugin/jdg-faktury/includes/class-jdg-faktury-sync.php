<?php
/**
 * Wysyłka zamówień do aplikacji Księgowość JDG i e-mail z fakturą do klienta.
 *
 * @package JDG_Faktury
 */

defined( 'ABSPATH' ) || exit;

class JDG_Faktury_Sync {

	const ACTION       = 'jdg_faktury_send_order';
	const MAX_ATTEMPTS = 6;

	public static function init() {
		add_action( 'woocommerce_order_status_processing', array( __CLASS__, 'on_status' ), 20, 1 );
		add_action( 'woocommerce_order_status_completed', array( __CLASS__, 'on_status' ), 20, 1 );
		add_action( self::ACTION, array( __CLASS__, 'process' ), 10, 1 );
		add_action( 'woocommerce_order_refunded', array( __CLASS__, 'on_refund' ), 10, 1 );
	}

	/** Zmiana statusu zamówienia — wystawiamy fakturę w tle, żeby nie spowalniać sklepu */
	public static function on_status( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order || ! JDG_Faktury_Settings::is_configured() ) {
			return;
		}
		$trigger = JDG_Faktury_Settings::get( 'trigger' );
		if ( ! $order->has_status( $trigger ) || $order->get_meta( '_jdg_invoice_number' ) ) {
			return;
		}
		self::schedule( $order_id, 0 );
	}

	public static function schedule( $order_id, $delay ) {
		if ( function_exists( 'as_schedule_single_action' ) ) {
			as_schedule_single_action( time() + $delay, self::ACTION, array( 'order_id' => (int) $order_id ), 'jdg-faktury' );
		} else {
			self::process( $order_id );
		}
	}

	/** Zapytanie do API aplikacji; zwraca [code, body] albo WP_Error */
	public static function request( $method, $path, $body = null, $raw = false ) {
		$url = JDG_Faktury_Settings::get( 'app_url' );
		$key = JDG_Faktury_Settings::get( 'api_key' );
		if ( ! $url || ! $key ) {
			return new WP_Error( 'jdg_config', 'Uzupełnij adres aplikacji i klucz API (WooCommerce → Faktury JDG).' );
		}
		$args = array(
			'method'  => $method,
			'timeout' => 30,
			'headers' => array(
				'X-JDG-Key'    => $key,
				'Content-Type' => 'application/json',
				'Accept'       => $raw ? 'application/pdf' : 'application/json',
			),
		);
		if ( null !== $body ) {
			$args['body'] = wp_json_encode( $body );
		}
		$res = wp_remote_request( $url . '/api/wp/v1' . $path, $args );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$text = wp_remote_retrieve_body( $res );
		return array(
			'code' => (int) wp_remote_retrieve_response_code( $res ),
			'body' => $raw ? $text : json_decode( $text, true ),
		);
	}

	/** Pozycja zamówienia w formacie aplikacji (kwoty brutto) */
	private static function line( $item ) {
		$net   = (float) $item->get_total();
		$tax   = (float) $item->get_total_tax();
		$rate  = null;
		$taxes = $item->get_taxes();
		if ( wc_tax_enabled() && ! empty( $taxes['total'] ) ) {
			foreach ( $taxes['total'] as $rate_id => $amount ) {
				if ( '' === $amount ) {
					continue;
				}
				$r = WC_Tax::_get_tax_rate( $rate_id );
				if ( ! empty( $r ) && isset( $r['tax_rate'] ) ) {
					$rate = (float) $r['tax_rate'];
					break;
				}
			}
		}
		if ( null === $rate && wc_tax_enabled() && $net > 0 ) {
			$rate = round( $tax / $net * 100, 2 );
		}
		return array(
			'name'    => $item->get_name(),
			'qty'     => method_exists( $item, 'get_quantity' ) ? (float) $item->get_quantity() : 1,
			'total'   => round( $net + $tax, 2 ),
			'vatRate' => $rate,
			'sku'     => ( method_exists( $item, 'get_product' ) && $item->get_product() ) ? $item->get_product()->get_sku() : '',
		);
	}

	public static function payload( WC_Order $order, $force = false ) {
		$items = array();
		foreach ( $order->get_items() as $item ) {
			$items[] = self::line( $item );
		}
		$shipping = array();
		foreach ( $order->get_items( 'shipping' ) as $item ) {
			$shipping[] = self::line( $item );
		}
		$fees = array();
		foreach ( $order->get_items( 'fee' ) as $item ) {
			$fees[] = self::line( $item );
		}
		$paid      = $order->get_date_paid();
		$completed = $order->get_date_completed();
		$created   = $order->get_date_created();
		return array(
			'orderId'            => (string) $order->get_id(),
			'orderNumber'        => (string) $order->get_order_number(),
			'currency'           => $order->get_currency(),
			'createdAt'          => $created ? $created->date( 'c' ) : null,
			'paidAt'             => $paid ? $paid->date( 'c' ) : null,
			'completedAt'        => $completed ? $completed->date( 'c' ) : null,
			'isPaid'             => $order->is_paid(),
			'paymentMethod'      => $order->get_payment_method(),
			'paymentMethodTitle' => $order->get_payment_method_title(),
			'wantsInvoice'       => JDG_Faktury_Checkout::wants_invoice( $order ),
			'force'              => (bool) $force,
			'buyer'              => array(
				'company'   => $order->get_billing_company(),
				'firstName' => $order->get_billing_first_name(),
				'lastName'  => $order->get_billing_last_name(),
				'nip'       => JDG_Faktury_Checkout::nip( $order ),
				'email'     => $order->get_billing_email(),
				'address1'  => $order->get_billing_address_1(),
				'address2'  => $order->get_billing_address_2(),
				'postcode'  => $order->get_billing_postcode(),
				'city'      => $order->get_billing_city(),
				'country'   => $order->get_billing_country(),
			),
			'items'              => $items,
			'shipping'           => $shipping,
			'fees'               => $fees,
			'total'              => (float) $order->get_total(),
		);
	}

	/**
	 * Wystawienie faktury w aplikacji. Ponawia próbę przy braku połączenia.
	 *
	 * @param int  $order_id ID zamówienia.
	 * @param bool $manual   Wywołane ręcznie z panelu zamówienia.
	 */
	public static function process( $order_id, $manual = false ) {
		$order = wc_get_order( $order_id );
		if ( ! $order || $order->get_meta( '_jdg_invoice_number' ) ) {
			return;
		}
		$res = self::request( 'POST', '/orders', self::payload( $order, $manual ) );

		if ( is_wp_error( $res ) || $res['code'] >= 500 || 409 === $res['code'] || 429 === $res['code'] ) {
			$why      = is_wp_error( $res ) ? $res->get_error_message() : ( isset( $res['body']['message'] ) ? $res['body']['message'] : 'kod ' . $res['code'] );
			$attempts = (int) $order->get_meta( '_jdg_attempts' ) + 1;
			$order->update_meta_data( '_jdg_attempts', $attempts );
			$order->update_meta_data( '_jdg_invoice_status', 'blad' );
			if ( ! $manual && $attempts < self::MAX_ATTEMPTS ) {
				$order->add_order_note( sprintf( 'Faktura JDG: nie udało się połączyć z aplikacją (%s). Kolejna próba za %d min.', $why, 5 * $attempts ) );
				self::schedule( $order_id, 300 * $attempts );
			} else {
				$order->add_order_note( 'Faktura JDG: nie udało się wystawić faktury — ' . $why . '. Użyj akcji „Wystaw fakturę (Księgowość JDG)” w zamówieniu.' );
			}
			$order->save();
			return;
		}

		$body   = is_array( $res['body'] ) ? $res['body'] : array();
		$status = isset( $body['status'] ) ? $body['status'] : '';

		if ( 'skipped' === $status ) {
			$order->update_meta_data( '_jdg_invoice_status', 'pominieta' );
			if ( $manual ) {
				$order->add_order_note( 'Faktura JDG: pominięto — ' . ( isset( $body['message'] ) ? $body['message'] : '' ) );
			}
			$order->save();
			return;
		}
		if ( empty( $body['ok'] ) || empty( $body['invoice']['number'] ) ) {
			$order->update_meta_data( '_jdg_invoice_status', 'blad' );
			$order->add_order_note( 'Faktura JDG: aplikacja odrzuciła zamówienie — ' . ( isset( $body['message'] ) ? $body['message'] : 'kod ' . $res['code'] ) );
			$order->save();
			return;
		}

		$order->update_meta_data( '_jdg_invoice_number', sanitize_text_field( $body['invoice']['number'] ) );
		$order->update_meta_data( '_jdg_invoice_status', 'wystawiona' );
		if ( ! empty( $body['url'] ) ) {
			$order->update_meta_data( '_jdg_invoice_url', esc_url_raw( $body['url'] ) );
		}
		$order->delete_meta_data( '_jdg_attempts' );
		$note = 'Faktura JDG: wystawiono fakturę nr ' . $body['invoice']['number'] . '.';
		if ( ! empty( $body['warning'] ) ) {
			$note .= ' Uwaga: ' . $body['warning'];
		}
		if ( isset( $body['email'] ) && 'wyslano' === $body['email'] ) {
			$note .= ' Aplikacja wysłała ją klientowi e-mailem.';
		} elseif ( isset( $body['email'] ) && 'blad' === $body['email'] ) {
			$note .= ' Nie udało się wysłać e-maila z aplikacji: ' . ( isset( $body['emailError'] ) ? $body['emailError'] : '' );
		}
		$order->add_order_note( $note );
		$order->save();

		if ( ! empty( $body['pdf'] ) && ! empty( $body['mail'] ) ) {
			self::email_customer( $order, base64_decode( $body['pdf'] ), $body['filename'], $body['mail'] );
		}
	}

	/** E-mail do klienta przez pocztę WordPressa, w szablonie e-maili WooCommerce */
	public static function email_customer( WC_Order $order, $pdf, $filename, $mail ) {
		$to = $order->get_billing_email();
		if ( ! $to || ! $pdf ) {
			return false;
		}
		$dir = trailingslashit( get_temp_dir() ) . 'jdg-faktury-' . wp_generate_password( 12, false );
		wp_mkdir_p( $dir );
		$file = $dir . '/' . sanitize_file_name( $filename ? $filename : 'faktura.pdf' );
		file_put_contents( $file, $pdf ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

		$mailer  = WC()->mailer();
		$subject = isset( $mail['subject'] ) ? $mail['subject'] : 'Faktura do zamówienia ' . $order->get_order_number();
		$message = $mailer->wrap_message( 'Faktura do zamówienia', isset( $mail['html'] ) ? $mail['html'] : '' );
		$sent    = $mailer->send( $to, $subject, $message, array( 'Content-Type: text/html; charset=UTF-8' ), array( $file ) );

		wp_delete_file( $file );
		@rmdir( $dir ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$order->add_order_note( $sent ? 'Faktura JDG: wysłano fakturę e-mailem do ' . $to . '.' : 'Faktura JDG: nie udało się wysłać e-maila do ' . $to . ' — sprawdź konfigurację poczty WordPressa.' );
		if ( $sent ) {
			$order->update_meta_data( '_jdg_invoice_emailed', current_time( 'mysql' ) );
		}
		$order->save();
		return $sent;
	}

	/** Ponowna wysyłka: pobieramy aktualny PDF z aplikacji */
	public static function resend( WC_Order $order ) {
		$res = self::request( 'GET', '/orders/' . rawurlencode( (string) $order->get_id() ) . '/pdf', null, true );
		if ( is_wp_error( $res ) || 200 !== $res['code'] ) {
			$order->add_order_note( 'Faktura JDG: nie udało się pobrać PDF z aplikacji.' );
			return false;
		}
		$number = $order->get_meta( '_jdg_invoice_number' );
		$url    = $order->get_meta( '_jdg_invoice_url' );
		$html   = '<p>Dzień dobry,</p><p>w załączniku przesyłamy fakturę nr <b>' . esc_html( $number ) . '</b> do zamówienia nr <b>' . esc_html( $order->get_order_number() ) . '</b>.</p>'
			. ( $url ? '<p>Fakturę można też pobrać: <a href="' . esc_url( $url ) . '">' . esc_html( $url ) . '</a></p>' : '' );
		return self::email_customer(
			$order,
			$res['body'],
			'Faktura_' . preg_replace( '/[^\w-]+/', '_', $number ) . '.pdf',
			array(
				'subject' => 'Faktura ' . $number . ' do zamówienia nr ' . $order->get_order_number(),
				'html'    => $html,
			)
		);
	}

	public static function on_refund( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( $order && $order->get_meta( '_jdg_invoice_number' ) ) {
			$order->add_order_note( 'Faktura JDG: zamówienie ma zwrot — wystaw fakturę korygującą do faktury ' . $order->get_meta( '_jdg_invoice_number' ) . ' w aplikacji Księgowość JDG.' );
		}
	}
}
