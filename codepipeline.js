const core = require("@actions/core");
const github = require("@actions/github");
const aws = require("aws-sdk");
const assert = require("assert");
const util = require("util");

module.exports = {
  executeCodePipeline,
};

// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CodePipeline.html#listActionExecutions-property
const actionExecutionStatusEmoji = {
  Abandoned: ":warning:",
  Failed: ":bangbang:",
  InProgress: ":crossed_fingers:",
  NotStarted: ":pray:",
  Succeeded: ":thumbsup:",
};

const pipelinePlaceholderUrl =
  "https://console.aws.amazon.com/codesuite/codepipeline/pipelines/%s/executions/%s/timeline?region=%s";

const userAgent = "github-actions/aws-codepipeline-execute";

// How long to wait when polling for the pipeline status, in milliseconds
const wait = 1000 * 20;

async function executeCodePipeline() {
  const { context } = github;

  const inputs = getInputs();
  const sdk = getSdk(inputs);

  const [execution, { pipeline }] = await Promise.all([
    sdk.codePipeline
      .startPipelineExecution({ name: inputs.pipelineName })
      .promise(),
    sdk.codePipeline.getPipeline({ name: inputs.pipelineName }).promise(),
  ]);
  const pipelineExecutionUrl = util.format(
    pipelinePlaceholderUrl,
    inputs.pipelineName,
    execution.pipelineExecutionId,
    sdk.region
  );

  const actions = pipeline.stages
    .map((stage) =>
      stage.actions.map((action) => ({
        actionName: action.name,
        stageName: stage.name,
        status: "NotStarted",
      }))
    )
    .flat();

  console.log(`Pipeline execution ID: ${execution.pipelineExecutionId}`);
  console.log(`Pipeline execution URL: ${pipelineExecutionUrl}`);
  console.log(`Pipeline actions:`);
  actions.forEach((action) =>
    console.log(`- ${action.stageName} / ${action.actionName}`)
  );

  const pullRequest =
    "pull_request" in context.payload
      ? await getPullRequestInfo(
          sdk,
          context,
          actions,
          inputs,
          pipelineExecutionUrl
        )
      : {};

  const result = await getResult(sdk, {
    actions: actions,
    pipelineName: inputs.pipelineName,
    pipelineExecutionId: execution.pipelineExecutionId,
    pullRequest: pullRequest,
  });

  return {
    ...result,
    executionId: execution.pipelineExecutionId,
    executionUrl: pipelineExecutionUrl,
  };
}

function formatAction(action) {
  const actionUrl = ((action["output"] || {})["executionResult"] || {})[
    "externalExecutionUrl"
  ];
  const status = actionUrl ? `[${action.status}](${actionUrl})` : action.status;
  return (
    `\n - ${actionExecutionStatusEmoji[action.status]}&nbsp;&nbsp;` +
    `${action.stageName} / ${action.actionName} - ${status}`
  );
}

function getInputs() {
  const githubToken = core.getInput("github-token", { required: true });
  const pipelineName = core.getInput("pipeline-name", { required: true });
  return { githubToken, pipelineName };
}

async function getPullRequestInfo(
  sdk,
  context,
  actions,
  inputs,
  pipelineExecutionUrl
) {
  const commitShaShort = context.payload.pull_request.head.sha.substring(0, 7);
  const pullRequestNumber = context.payload.pull_request.number;

  const heading =
    `CodePipeline: **[${inputs.pipelineName}](${pipelineExecutionUrl})** ` +
    `is executing against commit \`${commitShaShort}\``;

  const body = heading + actions.map((action) => formatAction(action)).join("");

  const comment = await sdk.octokit.rest.issues.createComment({
    ...context.repo,
    issue_number: pullRequestNumber,
    body,
  });

  const update = { ...context.repo, comment_id: comment.data.id, body };

  return { comment: { body, heading, update } };
}

function getSdk(inputs) {
  const codePipeline = new aws.CodePipeline({
    customUserAgent: userAgent,
    retryDelayOptions: { base: 1000 * 5 },
  });

  assert(
    codePipeline.config.credentials,
    "No credentials. Try adding @aws-actions/configure-aws-credentials earlier in your job to set up AWS credentials."
  );

  const octokit = github.getOctokit(inputs.githubToken, { userAgent });

  const region = codePipeline.config.region;

  return { codePipeline, octokit, region };
}

async function getResult(
  sdk,
  { actions, pipelineName, pipelineExecutionId, pullRequest }
) {
  console.log(
    `Polling started. Progress will be updated every ${wait / 1000} seconds.`
  );

  async function poll(actionExecutionEventIds) {
    await new Promise((resolve) => setTimeout(resolve, wait));

    // Get updated information about the pipeline and the actions within it.
    const [{ pipelineExecution }, { actionExecutionDetails }] =
      await Promise.all([
        sdk.codePipeline
          .getPipelineExecution({
            pipelineName: pipelineName,
            pipelineExecutionId: pipelineExecutionId,
          })
          .promise(),
        sdk.codePipeline
          .listActionExecutions({
            pipelineName,
            filter: { pipelineExecutionId },
          })
          .promise(),
      ]);

    // Reversing because we want to display oldest -> newest, and the results come in newest -> oldest.
    const updatedActions = actionExecutionDetails
      .filter(
        (action) =>
          !actionExecutionEventIds.includes(
            `${action.actionExecutionId}:${action.status}`
          )
      )
      .reverse();

    if (updatedActions.length === 0) console.log("...");
    else {
      // Update terminal
      updatedActions.forEach((action) =>
        console.log(
          `${action.stageName} / ${action.actionName} - ${action.status}`
        )
      );

      // Update pull request comment
      if (pullRequest.comment) {
        // Update the list of actions with execution details.
        const currentState = actions.map((action) => {
          const actionExecution = actionExecutionDetails.find(
            (execution) =>
              action.actionName === execution.actionName &&
              action.stageName === execution.stageName
          );
          return { ...action, ...actionExecution };
        });

        pullRequest.comment.update.body =
          pullRequest.comment.heading +
          currentState.map((action) => formatAction(action)).join("");

        if (pipelineExecution.status !== "InProgress") {
          pullRequest.comment.update.body =
            pullRequest.comment.update.body.replace(
              "is executing",
              "was executed"
            );
        }
      }
    }

    if (pullRequest.comment) {
      await sdk.octokit.rest.issues.updateComment(pullRequest.comment.update);
    }

    if (pipelineExecution.status === "InProgress") {
      return poll(
        actionExecutionDetails.map(
          (action) => `${action.actionExecutionId}:${action.status}`
        )
      );
    }

    return { status: pipelineExecution.status };
  }

  return await poll([]);
}
