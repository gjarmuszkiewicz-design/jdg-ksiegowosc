<?php
/**
 * Plugin Name:       Księgowość JDG — faktury do zamówień
 * Description:       Łączy sklep WooCommerce z aplikacją Księgowość JDG: pole „Chcę fakturę” i NIP w zamówieniu, automatyczne wystawienie faktury w aplikacji i wysyłka PDF do klienta.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Księgowość JDG
 * Text Domain:       jdg-faktury
 * WC requires at least: 7.0
 * WC tested up to:   10.3
 *
 * @package JDG_Faktury
 */

defined( 'ABSPATH' ) || exit;

define( 'JDG_FAKTURY_VERSION', '1.0.0' );
define( 'JDG_FAKTURY_FILE', __FILE__ );

require_once __DIR__ . '/includes/class-jdg-faktury-settings.php';
require_once __DIR__ . '/includes/class-jdg-faktury-checkout.php';
require_once __DIR__ . '/includes/class-jdg-faktury-sync.php';
require_once __DIR__ . '/includes/class-jdg-faktury-order-ui.php';

// Zgodność z nowym magazynem zamówień (HPOS) i zamówieniem w blokach
add_action(
	'before_woocommerce_init',
	function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', JDG_FAKTURY_FILE, true );
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', JDG_FAKTURY_FILE, true );
		}
	}
);

add_action(
	'plugins_loaded',
	function () {
		if ( ! class_exists( 'WooCommerce' ) ) {
			add_action(
				'admin_notices',
				function () {
					echo '<div class="notice notice-error"><p>Wtyczka <b>Księgowość JDG — faktury</b> wymaga WooCommerce.</p></div>';
				}
			);
			return;
		}
		JDG_Faktury_Settings::init();
		JDG_Faktury_Checkout::init();
		JDG_Faktury_Sync::init();
		JDG_Faktury_Order_UI::init();
	}
);

add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	function ( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=jdg-faktury' ) ) . '">Ustawienia</a>' );
		return $links;
	}
);
