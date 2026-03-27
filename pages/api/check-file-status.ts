import { NextApiRequest, NextApiResponse } from 'next'
import { ai } from '@/lib/google-genai-config'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { geminiFileId } = req.body

    if (!geminiFileId) {
      return res.status(400).json({ error: 'geminiFileId is required' })
    }

    // Verificar el estado del archivo con el cliente compartido (Vertex/Gemini según entorno)
    const fileInfo = await ai.files.get({ name: geminiFileId })
    
    return res.status(200).json({
      state: fileInfo.state,
      name: fileInfo.name,
      uri: fileInfo.uri
    })
  } catch (error) {
    console.error('Error checking file status:', error)
    return res.status(500).json({ 
      error: 'Failed to check file status',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}