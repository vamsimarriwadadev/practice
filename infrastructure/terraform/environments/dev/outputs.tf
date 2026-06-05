# infrastructure/terraform/environments/dev/outputs.tf

output "hello_world_function_name" {
  value = module.hello_world.function_name
}

output "s3_processor_function_name" {
  value = module.s3_processor.function_name
}

output "sqs_consumer_function_name" {
  value = module.sqs_consumer.function_name
}

output "demo_queue_url" {
  value = aws_sqs_queue.demo.url
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}
