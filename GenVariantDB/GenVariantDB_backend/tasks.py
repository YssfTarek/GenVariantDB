from celery import shared_task, group
import httpx

@shared_task
def send_chunk_to_nodejs(chunk, patient_id):
    node_url_variant = "http://localhost:3000/api/addVariants"
    
    data_payload = {
        "patient_id": patient_id,
        "data": chunk
    }
    
    try:
        with httpx.Client(timeout=120.0) as client:
            print(f"Sending chunk to Node.js: {data_payload}")
            response = client.post(node_url_variant, json=data_payload)
            if response.status_code != 201:
                print(f"Error uploading variant: {response.status_code}, {response.json()}")
                return {"status_code": response.status_code, "error":response.json()}
            return {"status_code":response.status_code, "data": response.json()}
        
    except httpx.RequestError as e:
        print(f"Request error sending chunk to Node.js for patient {patient_id}: {str(e)}")
        return {"status_code": 500, "error": str(e)}
    
    except Exception as e:
        print(f"Error sending chunk to Node.js for patient {patient_id}: {str(e)}")
        return {"status_code": 500, "error": str(e)}
    
@shared_task
def process_vcf_data_and_send_batches(vcf_data, patient_id, max_concurrent_requests):
    print("Beginning variant processing in task")
    chunk_size = 1000
    
    # Split data into chunks
    print("Splitting data into chunks")
    chunks = [vcf_data[i:i + chunk_size] for i in range(0, len(vcf_data), chunk_size)]

    # Create a group of tasks
    print("Grouping tasks")
    task_group = group(send_chunk_to_nodejs.s(chunk, patient_id) for chunk in chunks)
    
    print("Executing tasks asynchronously")
    group_result = task_group.apply_async()

    # Return the group ID for tracking
    return group_result.id

@shared_task
def simple_test_task(message):
    print(f"Simple task received message: {message}")
    return f"Task completed with message: {message}"

@shared_task
def trigger_node_app():
    try:
        # Send GET request to your Node.js app
        with httpx.Client() as client:
            response = client.get("http://localhost:3000/api/connect")
            
            # If successful, return the success message
            if response.status_code == 200:
                return {"message": "Success"}
            else:
                return {"error": f"Failed with status code {response.status_code}"}
    except httpx.RequestError as e:
        # Return error message if there's an issue with the request
        return {"error": f"Request failed: {str(e)}"}