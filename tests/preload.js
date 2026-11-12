/* Test bootstrap: isolate the test run from the real application database and stop the app from auto-starting. */
window.EV_DB_NAME = 'av_environment_intelligence_test_' + Date.now();
window.EV_NO_AUTOBOOT = true;
