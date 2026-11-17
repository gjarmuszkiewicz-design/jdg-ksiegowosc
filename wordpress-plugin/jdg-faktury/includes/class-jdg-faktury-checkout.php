<?php
/**
 * Pola „Chcę fakturę” i NIP w formularzu zamówienia — klasycznym i blokowym.
 *
 * @package JDG_Faktury
 */

defined( 'ABSPATH' ) || exit;

class JDG_Faktury_Checkout {

	const BLOCK_INVOICE = 'jdg-faktury/want-invoice';
	const BLOCK_NIP     = 'jdg-faktury/nip';

	public static function init() {
		if ( 'yes' === JDG_Faktury_Settings::get( 'invoice_field' ) ) {
			// klasyczny formularz zamówienia
			add_filter( 'woocommerce_billing_fields', array( __CLASS__, 'billing_fields' ) );
			add_action( 'woocommerce_after_checkout_validation', array( __CLASS__, 'validate_classic' ), 10, 2 );
			add_action( 'wp_enqueue_scripts', array( __CLASS__, 'toggle_script' ), 20 );
			// zamówienie w blokach (WooCommerce 8.9+)
			add_action( 'woocommerce_init', array( __CLASS__, 'register_block_fields' ) );
			add_action( 'woocommerce_validate_additional_field', array( __CLASS__, 'validate_block_field' ), 10, 3 );
		}
		add_action( 'woocommerce_admin_order_data_after_billing_address', array( __CLASS__, 'admin_billing_info' ) );
	}

	public static function billing_fields( $fields ) {
		$fields['billing_jdg_invoice'] = array(
			'type'     => 'checkbox',
			'label'    => 'Chcę fakturę',
			'required' => false,
			'class'    => array( 'form-row-wide' ),
			'priority' => 25,
		);
		$fields['billing_nip']         = array(
			'type'        => 'text',
			'label'       => 'NIP',
			'placeholder' => 'tylko przy fakturze na firmę',
			'required'    => false,
			'class'       => array( 'form-row-wide' ),
			'priority'    => 32,
		);
		return $fields;
	}

	public static function toggle_script() {
		if ( ! function_exists( 'is_checkout' ) || ! is_checkout() ) {
			return;
		}
		wp_add_inline_script(
			'wc-checkout',
			'jQuery(function($){function t(){$("#billing_nip_field").toggle($("#billing_jdg_invoice").is(":checked"));}$(document.body).on("change","#billing_jdg_invoice",t);t();});'
		);
	}

	public static function validate_classic( $data, $errors ) {
		$wants = ! empty( $data['billing_jdg_invoice'] );
		$nip   = isset( $data['billing_nip'] ) ? $data['billing_nip'] : '';
		if ( $wants && '' !== trim( $nip ) && ! self::is_valid_nip( $nip ) ) {
			$errors->add( 'billing_nip', 'Podany <strong>NIP</strong> jest nieprawidłowy — sprawdź cyfry.' );
		}
	}

	public static function register_block_fields() {
		if ( ! function_exists( 'woocommerce_register_additional_checkout_field' ) ) {
			return;
		}
		woocommerce_register_additional_checkout_field(
			array(
				'id'       => self::BLOCK_INVOICE,
				'label'    => 'Chcę fakturę',
				'location' => 'order',
				'type'     => 'checkbox',
			)
		);
		woocommerce_register_additional_checkout_field(
			array(
				'id'            => self::BLOCK_NIP,
				'label'         => 'NIP do faktury',
				'optionalLabel' => 'NIP do faktury (tylko przy fakturze na firmę)',
				'location'      => 'order',
				'type'          => 'text',
				'required'      => false,
			)
		);
	}

	public static function validate_block_field( $errors, $field_key, $field_value ) {
		if ( self::BLOCK_NIP === $field_key && '' !== trim( (string) $field_value ) && ! self::is_valid_nip( $field_value ) ) {
			$errors->add( 'jdg_invalid_nip', 'Podany NIP jest nieprawidłowy — sprawdź cyfry.' );
		}
	}

	/** Wartość pola z zamówienia blokowego */
	private static function block_value( $order, $id ) {
		if ( class_exists( '\Automattic\WooCommerce\Blocks\Package' ) && class_exists( '\Automattic\WooCommerce\Blocks\Domain\Services\CheckoutFields' ) ) {
			try {
				$fields = \Automattic\WooCommerce\Blocks\Package::container()->get( \Automattic\WooCommerce\Blocks\Domain\Services\CheckoutFields::class );
				$value  = $fields->get_field_from_object( $id, $order, 'other' );
				if ( null !== $value && '' !== $value ) {
					return $value;
				}
			} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
				// starsza wersja WooCommerce — czytamy meta poniżej
			}
		}
		return $order->get_meta( '_wc_other/' . $id );
	}

	public static function wants_invoice( WC_Order $order ) {
		$v = $order->get_meta( '_billing_jdg_invoice' );
		if ( '' === $v || null === $v ) {
			$v = self::block_value( $order, self::BLOCK_INVOICE );
		}
		return in_array( $v, array( 1, '1', true, 'true', 'yes', 'on' ), true ) || '' !== self::nip( $order );
	}

	/** NIP z naszego pola albo z popularnych wtyczek do faktur */
	public static function nip( WC_Order $order ) {
		$candidates = array( $order->get_meta( '_billing_nip' ), self::block_value( $order, self::BLOCK_NIP ), $order->get_meta( '_billing_vat_number' ), $order->get_meta( '_vat_number' ), $order->get_meta( '_billing_vat' ), $order->get_meta( 'NIP' ) );
		foreach ( $candidates as $c ) {
			if ( is_string( $c ) && '' !== trim( $c ) ) {
				return trim( $c );
			}
		}
		return '';
	}

	public static function is_valid_nip( $nip ) {
		$n = preg_replace( '/\D/', '', (string) $nip );
		if ( 10 !== strlen( $n ) ) {
			return false;
		}
		$w   = array( 6, 5, 7, 2, 3, 4, 5, 6, 7 );
		$sum = 0;
		for ( $i = 0; $i < 9; $i++ ) {
			$sum += (int) $n[ $i ] * $w[ $i ];
		}
		return ( $sum % 11 ) === (int) $n[9];
	}

	public static function admin_billing_info( $order ) {
		$nip = self::nip( $order );
		if ( self::wants_invoice( $order ) ) {
			echo '<p><strong>Faktura:</strong> tak' . ( $nip ? ' — NIP ' . esc_html( $nip ) : ' (osoba prywatna)' ) . '</p>';
		}
	}
}
