=== Księgowość JDG — faktury do zamówień ===
Requires at least: 6.0
Requires PHP: 7.4
WC requires at least: 7.0
Stable tag: 1.0.0

Automatyczne faktury do zamówień WooCommerce wystawiane w aplikacji Księgowość JDG.

== Opis ==

* Dodaje do zamówienia pole „Chcę fakturę” i NIP (klasyczny formularz i zamówienie w blokach).
* Po opłaceniu (albo zrealizowaniu) zamówienia wysyła je do aplikacji, która wystawia fakturę z Twoją numeracją.
* Klient dostaje fakturę PDF e-mailem i może ją pobrać na swoim koncie w sklepie.
* W panelu zamówienia: numer faktury, link do PDF, akcje „Wystaw fakturę” i „Wyślij fakturę ponownie”.
* Przy braku połączenia ponawia próbę w tle (Action Scheduler).

== Instalacja ==

1. W aplikacji: Sklepy WordPress → Dodaj sklep → skopiuj adres aplikacji i klucz API.
2. W WordPressie: Wtyczki → Dodaj nową → Wyślij wtyczkę na serwer → wybierz plik .zip → Włącz.
3. WooCommerce → Faktury JDG: wklej adres i klucz, zapisz, kliknij „Sprawdź połączenie z aplikacją”.

Każdy sklep ma własny klucz — możesz podłączyć dowolnie wiele stron do jednej aplikacji.
