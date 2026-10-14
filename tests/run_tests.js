/**
 * Liquid Media - Test Runner
 * Executes all unit and integration test suites.
 */

async function main() {
  console.log('====================================================');
  console.log('       LIQUID MEDIA TEST VERIFICATION SUITE         ');
  console.log('====================================================\n');

  try {
    // 1. Validators Suite
    require('./validators.test.js');

    // 2. Formats Suite
    require('./formats.test.js');

    // 3. Companion Suite
    const { runTests } = require('./companion.test.js');
    await runTests();

    console.log('====================================================');
    console.log('  SUCCESS: ALL SUITES PASSED VALIDATION (100%)       ');
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Failure:', err);
    process.exit(1);
  }
}

main();
