<?php
/**
 * Faktura w panelu zamówienia (sklep) i na koncie klienta.
 *
 * @package JDG_Faktury
 */

defined( 'ABSPATH' ) || exit;

class JDG_Faktury_Order_UI {

	public static function init() {
		add_filter( 'woocommerce_order_actions', array( __CLASS__, 'order_actions' ), 10, 2 );
		add_action( 'woocommerce_order_action_jdg_issue_invoice', array( __CLASS__, 'action_issue' ) );
		add_action( 'woocommerce_order_action_jdg_resend_invoice', array( __CLASS__, 'action_resend' ) );
		add_action( 'woocommerce_admin_order_data_after_order_details', array( __CLASS__, 'admin_box' ) );
		add_action( 'woocommerce_order_details_after_order_table', array( __CLASS__, 'customer_link' ) );
		add_action( 'woocommerce_email_after_order_table', array( __CLASS__, 'email_link' ), 10, 3 );
	}

	public static function order_actions( $actions, $order = null ) {
		if ( $order && $order->get_meta( '_jdg_invoice_number' ) ) {
			$actions['jdg_resend_invoice'] = 'Wyślij klientowi fakturę ponownie (Księgowość JDG)';
		} else {
			$actions['jdg_issue_invoice'] = 'Wystaw fakturę (Księgowość JDG)';
		}
		return $actions;
	}

	/** Ręczne wystawienie z panelu — także gdy klient nie zaznaczył „Chcę fakturę” */
	public static function action_issue( $order ) {
		JDG_Faktury_Sync::process( $order->get_id(), true );
	}

	public static function action_resend( $order ) {
		JDG_Faktury_Sync::resend( $order );
	}

	public static function admin_box( $order ) {
		$number = $order->get_meta( '_jdg_invoice_number' );
		$url    = $order->get_meta( '_jdg_invoice_url' );
		$status = $order->get_meta( '_jdg_invoice_status' );
		echo '<p class="form-field form-field-wide"><strong>Faktura (Księgowość JDG):</strong><br>';
		if ( $number ) {
			echo esc_html( $number );
			if ( $url ) {
				echo ' — <a href="' . esc_url( $url ) . '" target="_blank" rel="noopener">pobierz PDF</a>';
			}
		} elseif ( 'pominieta' === $status ) {
			echo 'nie wystawiono (klient nie prosił o fakturę)';
		} elseif ( 'blad' === $status ) {
			echo '<span style="color:#b32d2e">błąd — zobacz notatki zamówienia</span>';
		} else {
			echo '—';
		}
		echo '</p>';
	}

	public static function customer_link( $order ) {
		$url = $order->get_meta( '_jdg_invoice_url' );
		if ( ! $url ) {
			return;
		}
		echo '<section class="woocommerce-jdg-invoice"><h2>Faktura</h2><p>Faktura nr ' . esc_html( $order->get_meta( '_jdg_invoice_number' ) ) . ' — <a class="button" href="' . esc_url( $url ) . '" target="_blank" rel="noopener">Pobierz PDF</a></p></section>';
	}

	public static function email_link( $order, $sent_to_admin, $plain_text ) {
		$url = $order->get_meta( '_jdg_invoice_url' );
		if ( ! $url || $sent_to_admin ) {
			return;
		}
		$number = $order->get_meta( '_jdg_invoice_number' );
		if ( $plain_text ) {
			echo "\nFaktura nr " . esc_html( $number ) . ': ' . esc_url_raw( $url ) . "\n";
		} else {
			echo '<p>Faktura nr ' . esc_html( $number ) . ': <a href="' . esc_url( $url ) . '">pobierz PDF</a></p>';
		}
	}
}
