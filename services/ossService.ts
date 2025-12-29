
/**
 * Aliyun OSS Upload Service (via Proxy Backend)
 */

const UPLOAD_ENDPOINT = 'http://115.191.1.112:8000/upload';

/**
 * Uploads a file to Aliyun OSS via the backend proxy to handle CORS and auth.
 */
export async function uploadToOSS(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.status === 'success' && data.public_url) {
      return data.public_url;
    } else {
      throw new Error(data.message || 'Upload failed at backend');
    }
  } catch (error) {
    console.error('Upload Error:', error);
    throw error;
  }
}
