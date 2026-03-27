// Test script para verificar autenticación Vertex AI
import { GoogleGenAI } from '@google/genai';

async function testVertexAI() {
  console.log('🧪 Probando configuración Vertex AI...\n');
  
  const project = 'project-f72e4c83-5347-45b1-bb2';
  const location = 'southamerica-west1';
  const keyFile = './aurora-encryption-key.json';
  
  console.log('📋 Configuración:');
  console.log('  Project:', project);
  console.log('  Location:', location);
  console.log('  Key file:', keyFile);
  console.log('');
  
  try {
    // Intentar con southamerica-west1
    console.log('🔧 Creando cliente Vertex AI con southamerica-west1...');
    const ai = new GoogleGenAI({
      vertexai: true,
      project,
      location,
      googleAuthOptions: { keyFilename: keyFile }
    });
    
    console.log('✅ Cliente creado exitosamente');
    console.log('🚀 Intentando generateContent...\n');
    
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [{ role: 'user', parts: [{ text: 'Di solo "ok"' }] }]
    });
    
    console.log('✅ SUCCESS! Respuesta:', result.text());
    console.log('✅ La región southamerica-west1 funciona correctamente');
    
  } catch (error) {
    console.error('❌ ERROR con southamerica-west1:', error.message);
    
    if (error.message.includes('FAILED_PRECONDITION')) {
      console.log('\n🔍 Probando con us-central1...');
      
      try {
        const ai2 = new GoogleGenAI({
          vertexai: true,
          project,
          location: 'us-central1',
          googleAuthOptions: { keyFilename: keyFile }
        });
        
        const result2 = await ai2.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: [{ role: 'user', parts: [{ text: 'Di solo "ok"' }] }]
        });
        
        const responseText = result2.response?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin texto';
        console.log('✅ SUCCESS con us-central1! Respuesta:', responseText);
        console.log('⚠️  PROBLEMA IDENTIFICADO: southamerica-west1 NO soporta Gemini');
        console.log('✅ SOLUCIÓN: Cambiar GOOGLE_CLOUD_LOCATION a us-central1 en .env.local');
        
      } catch (error2) {
        console.error('❌ ERROR también con us-central1:', error2.message);
        console.log('\n🔍 Esto indica un problema de permisos IAM');
      }
    }
  }
}

testVertexAI();
