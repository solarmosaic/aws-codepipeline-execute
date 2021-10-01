const core = require("@actions/core");
const { executeCodePipeline } = require("./codepipeline");
const assert = require("assert");

if (require.main === module) {
  execute();
}

module.exports = execute;

async function execute() {
  console.log("***** PIPELINE EXECUTION STARTING *****");
  try {
    const pipeline = await executeCodePipeline();
    core.setOutput("pipeline-execution-id", pipeline.executionId);
    core.setOutput("pipeline-execution-status", pipeline.status);
    core.setOutput("pipeline-execution-url", pipeline.url);

    assert(
      pipeline.status === "Succeeded",
      `Pipeline execution status: ${pipeline.status}`
    );
  } catch (error) {
    core.setFailed(error.message);
  } finally {
    console.log("***** PIPELINE EXECUTION COMPLETE *****");
  }
}
