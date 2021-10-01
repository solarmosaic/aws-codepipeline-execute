# aws-codepipeline-execute

```yaml
steps:
  - uses: aws-actions/configure-aws-credentials@v1
    with:
      aws-access-key-id: "${{ secrets.CICD_USER_ACCESS_KEY_ID }}"
      aws-secret-access-key: "${{ secrets.CICD_USER_SECRET_ACCESS_KEY }}"
      aws-region: "us-east-1"
      role-to-assume: "${{ secrets.CICD_ASSUME_ROLE_ARN }}"
  - name: Execute CodePipeline
    uses: solarmosaic/aws-codepipeline-execute@v1-beta
    with:
      github-token: "${{ secrets.GITHUB_TOKEN }}"
      pipeline-name: MyCodePipeline
```

Executes a [CodePipeline](https://aws.amazon.com/codepipeline/) against the latest version of the configured pipeline source location and monitors the result, providing feedback in the running Job and in a pull request comment.

## Credentials and Permissions

The job must have proper AWS credentials in order to interact with the CodePipeline. It is recommended to use this action in conjunction with [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials).

The authenticated session must have the following [IAM permissions](https://docs.aws.amazon.com/service-authorization/latest/reference/list_awscodepipeline.html):

- `codepipeline:GetPipeline`
- `codepipeline:GetPipelineExecution`
- `codepipeline:ListActionExecutions`
- `codepipeline:StartPipelineExecution`

## Packaging

The packaged build is output to the `dist` directory. To package a build:

- Make sure you have `ncc` installed: `npm i -g @vercel/ncc`
- Run `npm format`
- Run `npm run package`

## License

This project is distributed under the [MIT License](https://opensource.org/licenses/MIT). See [LICENSE](LICENSE) for more information.
