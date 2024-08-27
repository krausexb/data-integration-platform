const AWS = require('aws-sdk')

var apigateway = new AWS.APIGateway({ apiVersion: '2015-07-09' });

module.exports.handler = async (event, context) => {
  const apiId = event.requestContext.apiId
  const stage = event.requestContext.stage

  var params = {
    exportType: 'swagger',
    restApiId: apiId,
    stageName: stage,
    accepts: 'application/json'
  };

  var getExportPromise = await apigateway.getExport(params).promise();
  var swaggerJson = JSON.parse(getExportPromise.body)

  delete swaggerJson['paths']['/docs/{proxy+}']
  delete swaggerJson['paths']['/docs']

  console.log('Generated Swagger File: ' + swaggerJson)

  var swaggerSpec = JSON.stringify(swaggerJson)

  const html = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@3/swagger-ui.css">
    </head>
    <body>
      <div id="swagger"></div>
      <script src="https://unpkg.com/swagger-ui-dist@3/swagger-ui-bundle.js"></script>
      <script>
        // SwaggerUIBundle({ dom_id: '#swagger', url: '/swagger.yaml' });
        SwaggerUIBundle({ dom_id: '#swagger', spec: ${swaggerSpec} });
      </script>
    </body>
  </html>`

  return {
    statusCode: 200,
    headers: { 'content-type': 'text/html' },
    body: html
  };
}
