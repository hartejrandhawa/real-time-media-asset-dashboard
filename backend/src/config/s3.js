const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config({ quiet: true });

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const URL_TTL_SECONDS = 300;

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  // Optional: point at an S3-compatible endpoint (S3Mock/MinIO) for local dev.
  // Leave unset to talk to real AWS S3.
  ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  // Newer SDK versions add CRC32 checksum params to presigned PUT URLs by
  // default. A browser uploading a file can't satisfy a checksum computed
  // over an empty body, so only send checksums when S3 actually requires one.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

function getUploadUrl(key, contentType) {
  const command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType });
  return getSignedUrl(s3, command, { expiresIn: URL_TTL_SECONDS });
}

function getDownloadUrl(key, filename) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    // Download with the original filename rather than the UUID-prefixed key.
    ...(filename && {
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    }),
  });
  return getSignedUrl(s3, command, { expiresIn: URL_TTL_SECONDS });
}

// Returns { size, contentType } or null if the object doesn't exist.
async function headObject(key) {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return { size: res.ContentLength, contentType: res.ContentType };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

function deleteObject(key) {
  return s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
}

module.exports = {
  BUCKET_NAME,
  URL_TTL_SECONDS,
  getUploadUrl,
  getDownloadUrl,
  headObject,
  deleteObject,
};
