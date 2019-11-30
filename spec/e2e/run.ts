import { exec, rm } from 'shelljs';
const chai = require('chai');
const chaiFiles = require('chai-files');

chai.use(chaiFiles);

const getFixtureName = (thread: boolean) => {
  return {
    config: `webpack${thread ? '.thread' : ''}.config.ts`,
    outputs: [`e2e${thread ? '.thread' : ''}.bundle.js`, `e2e${thread ? '.thread' : ''}.style.css`]
  };
};

/**
 * Naive e2e test runner, file-to-file comparison between config without loader.
 */
(async () => {
  try {
    rm('-rf', 'dist/e2e');

    const fixtures = [getFixtureName(true), getFixtureName(false)];
    await Promise.all(fixtures.map((fixture) => exec(`webpack --config spec/e2e/${fixture.config}`)));

    chai
      .expect(chaiFiles.file(`dist/e2e/${fixtures[0].outputs[0]}`))
      .to.equal(chaiFiles.file(`dist/e2e/${fixtures[1].outputs[0]}`));
    chai
      .expect(chaiFiles.file(`dist/e2e/${fixtures[0].outputs[1]}`))
      .to.equal(chaiFiles.file(`dist/e2e/${fixtures[1].outputs[1]}`));
  } catch (error) {
    process.exitCode = -1;
    throw error;
  }
})();
