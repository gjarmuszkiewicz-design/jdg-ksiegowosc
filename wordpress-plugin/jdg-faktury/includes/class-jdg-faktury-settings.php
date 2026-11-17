<?php
/**
 * Ustawienia wtyczki: adres aplikacji, klucz API, moment wystawienia faktury.
 *
 * @package JDG_Faktury
 */

defined( 'ABSPATH' ) || exit;

class JDG_Faktury_Settings {

	const OPTION = 'jdg_faktury_settings';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_post_jdg_faktury_test', array( __CLASS__, 'test_connection' ) );
	}

	/** Wszystkie ustawienia z wartościami domyślnymi */
	public static function get( $key = null ) {
		$defaults = array(
			'app_url'       => '',
			'api_key'       => '',
			'trigger'       => 'processing',
			'invoice_field' => 'yes',
		);
		$opts = wp_parse_args( (array) get_option( self::OPTION, array() ), $defaults );
		return null === $key ? $opts : ( isset( $opts[ $key ] ) ? $opts[ $key ] : null );
	}

	public static function is_configured() {
		return self::get( 'app_url' ) && self::get( 'api_key' );
	}

	public static function menu() {
		add_submenu_page( 'woocommerce', 'Faktury — Księgowość JDG', 'Faktury JDG', 'manage_woocommerce', 'jdg-faktury', array( __CLASS__, 'page' ) );
	}

	public static function register() {
		register_setting(
			'jdg_faktury',
			self::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize' ),
			)
		);
	}

	public static function sanitize( $input ) {
		$input = (array) $input;
		$prev  = self::get();
		$key   = isset( $input['api_key'] ) ? trim( sanitize_text_field( $input['api_key'] ) ) : '';
		return array(
			'app_url'       => isset( $input['app_url'] ) ? untrailingslashit( esc_url_raw( trim( $input['app_url'] ) ) ) : '',
			// puste pole = zostaw zapisany klucz (nie pokazujemy go w formularzu)
			'api_key'       => '' !== $key ? $key : $prev['api_key'],
			'trigger'       => isset( $input['trigger'] ) && in_array( $input['trigger'], array( 'processing', 'completed' ), true ) ? $input['trigger'] : 'processing',
			'invoice_field' => ! empty( $input['invoice_field'] ) ? 'yes' : 'no',
		);
	}

	public static function page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$o      = self::get();
		$result = isset( $_GET['jdg_test'] ) ? sanitize_text_field( wp_unslash( $_GET['jdg_test'] ) ) : '';
		$msg    = get_transient( 'jdg_faktury_test_msg' );
		?>
		<div class="wrap">
			<h1>Faktury — Księgowość JDG</h1>
			<p>Faktury do zamówień wystawia aplikacja Księgowość JDG. Adres aplikacji i klucz API znajdziesz w aplikacji: <b>Integracje → Sklepy WordPress</b>.</p>
			<?php if ( $result && $msg ) : ?>
				<div class="notice notice-<?php echo 'ok' === $result ? 'success' : 'error'; ?>"><p><?php echo esc_html( $msg ); ?></p></div>
			<?php endif; ?>
			<form method="post" action="options.php">
				<?php settings_fields( 'jdg_faktury' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="jdg_app_url">Adres aplikacji</label></th>
						<td><input type="url" id="jdg_app_url" class="regular-text" name="<?php echo esc_attr( self::OPTION ); ?>[app_url]" value="<?php echo esc_attr( $o['app_url'] ); ?>" placeholder="https://twoja-aplikacja.up.railway.app" required></td>
					</tr>
					<tr>
						<th scope="row"><label for="jdg_api_key">Klucz API sklepu</label></th>
						<td>
							<input type="password" id="jdg_api_key" class="regular-text" name="<?php echo esc_attr( self::OPTION ); ?>[api_key]" value="" autocomplete="new-password" placeholder="<?php echo $o['api_key'] ? esc_attr( substr( $o['api_key'], 0, 8 ) . '… (zapisany — wpisz nowy, aby zmienić)' ) : 'jdg_…'; ?>">
							<p class="description">Każdy sklep ma własny klucz. Klucz widać w aplikacji tylko raz — w razie zgubienia wygeneruj nowy.</p>
						</td>
					</tr>
					<tr>
						<th scope="row">Kiedy wystawić fakturę</th>
						<td>
							<label><input type="radio" name="<?php echo esc_attr( self::OPTION ); ?>[trigger]" value="processing" <?php checked( $o['trigger'], 'processing' ); ?>> po opłaceniu zamówienia (status „W trakcie realizacji”)</label><br>
							<label><input type="radio" name="<?php echo esc_attr( self::OPTION ); ?>[trigger]" value="completed" <?php checked( $o['trigger'], 'completed' ); ?>> po zrealizowaniu zamówienia (status „Zrealizowane”)</label>
							<p class="description">Czy faktura ma powstać do każdego zamówienia, czy tylko na żądanie klienta — ustawiasz w aplikacji.</p>
						</td>
					</tr>
					<tr>
						<th scope="row">Pola w zamówieniu</th>
						<td><label><input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[invoice_field]" value="1" <?php checked( $o['invoice_field'], 'yes' ); ?>> Dodaj do formularza zamówienia „Chcę fakturę” i pole NIP</label>
						<p class="description">Wyłącz, jeśli inna wtyczka już zbiera NIP (odczytujemy też pola <code>_billing_nip</code>, <code>_billing_vat_number</code> i <code>_vat_number</code>).</p></td>
					</tr>
				</table>
				<?php submit_button( 'Zapisz ustawienia' ); ?>
			</form>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="jdg_faktury_test">
				<?php wp_nonce_field( 'jdg_faktury_test' ); ?>
				<?php submit_button( 'Sprawdź połączenie z aplikacją', 'secondary', 'submit', false ); ?>
			</form>
		</div>
		<?php
	}

	public static function test_connection() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( 'Brak uprawnień.' );
		}
		check_admin_referer( 'jdg_faktury_test' );
		$res = JDG_Faktury_Sync::request( 'GET', '/ping' );
		if ( is_wp_error( $res ) ) {
			$ok  = false;
			$msg = 'Brak połączenia: ' . $res->get_error_message();
		} elseif ( empty( $res['body']['ok'] ) ) {
			$ok  = false;
			$msg = 'Aplikacja odrzuciła połączenie: ' . ( isset( $res['body']['message'] ) ? $res['body']['message'] : 'kod ' . $res['code'] );
		} else {
			$ok      = true;
			$company = isset( $res['body']['company']['name'] ) ? $res['body']['company']['name'] : '—';
			$site    = isset( $res['body']['site']['name'] ) ? $res['body']['site']['name'] : '';
			$msg     = sprintf( 'Połączono! Firma: %s, sklep w aplikacji: %s.', $company, $site );
		}
		set_transient( 'jdg_faktury_test_msg', $msg, 60 );
		wp_safe_redirect( admin_url( 'admin.php?page=jdg-faktury&jdg_test=' . ( $ok ? 'ok' : 'err' ) ) );
		exit;
	}
}
