import json

def update_resource(event):
    print(event)
    
    response = "Executing UpdateResource"

    return response

def lambda_handler(event, context):   
    response = update_resource(event)

    return {
        'statusCode': 200,
        'body': json.dumps(response)
    }