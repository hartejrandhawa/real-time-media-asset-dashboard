const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

function getUploadUrl(key, contentType) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: 300 });
}

function getDownloadUrl(key) {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 300 });
}

function deleteObject(key) {
  const command = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  return s3.send(command);
}

module.exports = { BUCKET_NAME, getUploadUrl, getDownloadUrl, deleteObject };
