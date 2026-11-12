/* The application, started inside a phone-sized frame by the test suite, on the database of the running test. */
window.EV_DB_NAME = new URLSearchParams(location.search).get('db') || 'av_environment_intelligence_test_frame';
/* the database an earlier version would have used, for the test that moves one */
if (new URLSearchParams(location.search).get('legacy')) window.EV_LEGACY_DB_NAME = new URLSearchParams(location.search).get('legacy');
