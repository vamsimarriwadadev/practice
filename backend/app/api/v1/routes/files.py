from fastapi import APIRouter
from uuid import uuid4

from app.services.aws.s3_service import S3Service

router = APIRouter(
    prefix="/files",
    tags=["files"]
)

s3_service = S3Service()


@router.get("/upload-url")
async def generate_upload_url(
    filename: str
):

    file_id = uuid4()

    key = f"{file_id}/{filename}"

    upload_url = await s3_service.generate_presigned_url(
        key=key
    )

    return {
        "success": True,
        "key": key,
        "upload_url": upload_url
    }


@router.get("/download-url/{key:path}")
async def generate_download_url(
    key: str
):

    download_url = await s3_service.generate_download_url(
        key=key
    )

    return {
        "success": True,
        "download_url": download_url
    }


@router.get("/")
async def get_files():

    files = await s3_service.list_files()

    return {
        "success": True,
        "files": [
            {
                "key": file["Key"],
                "size": file["Size"],
                "last_modified": file["LastModified"]
            }
            for file in files
        ]
    }


@router.delete("/{key:path}")
async def delete_file(
    key: str
):

    await s3_service.delete_file(key)

    return {
        "success": True,
        "message": "File deleted successfully"
    }