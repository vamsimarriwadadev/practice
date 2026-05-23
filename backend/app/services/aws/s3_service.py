import aioboto3
import os
from botocore.exceptions import ClientError


class S3Service:

    def __init__(self):
        self.session = aioboto3.Session()

        self.endpoint_url = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4566")
        self.aws_access_key_id = "test"
        self.aws_secret_access_key = "test"
        self.region_name = "us-east-1"

        self.bucket_name = "uploads"

    async def get_client(self):
        return self.session.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.aws_access_key_id,
            aws_secret_access_key=self.aws_secret_access_key,
            region_name=self.region_name
        )

    async def create_bucket(self):

        async with await self.get_client() as s3:

            try:
                await s3.create_bucket(
                    Bucket=self.bucket_name
                )
                
                # Configure CORS on the S3 bucket to allow browser uploads/downloads
                await s3.put_bucket_cors(
                    Bucket=self.bucket_name,
                    CORSConfiguration={
                        'CORSRules': [
                            {
                                'AllowedHeaders': ['*'],
                                'AllowedMethods': ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                                'AllowedOrigins': ['*'],
                                'ExposeHeaders': ['ETag']
                            }
                        ]
                    }
                )

            except ClientError as e:
                print(e)

    async def generate_presigned_url(
        self,
        key: str,
        expiration: int = 3600
    ) -> str:

        async with await self.get_client() as s3:

            url = await s3.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": key
                },
                ExpiresIn=expiration
            )

            return url
    
    async def generate_download_url(
        self,
        key: str,
        expiration: int = 3600
    ) -> str:

        async with await self.get_client() as s3:

            url = await s3.generate_presigned_url(
                ClientMethod="get_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": key
                },
                ExpiresIn=expiration
            )

            return url

    async def get_file(
        self,
        key: str
    ):

        async with await self.get_client() as s3:

            response = await s3.get_object(
                Bucket=self.bucket_name,
                Key=key
            )

            return response

    async def delete_file(
        self,
        key: str
    ):

        async with await self.get_client() as s3:

            await s3.delete_object(
                Bucket=self.bucket_name,
                Key=key
            )

    async def list_files(self):

        async with await self.get_client() as s3:

            response = await s3.list_objects_v2(
                Bucket=self.bucket_name
            )

            return response.get("Contents", [])
    
    async def download_file_bytes(
        self,
        key: str
    ) -> bytes:

        async with await self.get_client() as s3:

            response = await s3.get_object(
                Bucket=self.bucket_name,
                Key=key
            )

            return await response["Body"].read()

    async def upload_file_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "image/png"
    ):

        async with await self.get_client() as s3:

            await s3.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=data,
                ContentType=content_type
            )