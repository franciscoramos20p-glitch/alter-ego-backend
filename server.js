import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { Readable } from 'stream';

dotenv.config();

// Configuramos FFMPEG (El motor de conversión instantánea)
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

console.log(`🚀 SERVIDOR "FERRARI" REALTIME (0.3s) - server.js LISTO en puerto ${PORT}`);

wss.on('connection', (ws, req) => {
    const url = req.url || "/";
    console.log(`⚡ Conexión entrante: ${url}`);

    if (url.includes('/live')) {
        handleRealtimeSession(ws);
    } else {
        console.log("Conexión clásica ignorada en esta demo");
    }
});

function handleRealtimeSession(clientWs) {
    // 1. Conectar a OpenAI Realtime (El Cerebro Rápido)
    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
        }
    });

    let config = { my_lang: 'Español', target_lang: 'Inglés' };

    // 2. Configurar la sesión al conectar
    openAiWs.on('open', () => {
        console.log('✅ OpenAI Conectado - Listo para velocidad 0.3s');
        const sessionUpdate = {
            type: "session.update",
            session: {
                modalities: ["text", "audio"],
                instructions: `Eres un intérprete simultáneo de élite. Tu latencia debe ser cero.
                Traduce lo que escuches del ${config.my_lang} al ${config.target_lang} y viceversa.
                NO respondas, SOLO traduce. Mantén el tono de voz exacto.`,
                voice: "alloy",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                turn_detection: null 
            }
        };
        openAiWs.send(JSON.stringify(sessionUpdate));
    });

    // 3. Recibir audio de la APP y convertirlo AL VUELO
    clientWs.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'config') {
                config = data;
                console.log(`🎙️ Idiomas: ${config.my_lang} <-> ${config.target_lang}`);
            } 
            else if (data.type === 'audio_append') {
                // Conversión M4A -> PCM16 en memoria RAM (Ultrarrápido)
                const inputBuffer = Buffer.from(data.audio, 'base64');
                convertAndSend(inputBuffer, openAiWs);
            }
        } catch (e) {
            console.error("Error App:", e.message);
        }
    });

    // 4. Recibir respuesta de OpenAI y mandarla a la App
    openAiWs.on('message', (data) => {
        try {
            const response = JSON.parse(data);
            if (response.type === 'response.audio.delta') {
                // Truco: Convertimos PCM16 a WAV para que Expo lo reproduzca sin llorar
                const pcmBuffer = Buffer.from(response.delta, 'base64');
                const wavBuffer = toWav(pcmBuffer); 
                
                clientWs.send(JSON.stringify({
                    type: 'audio_delta',
                    payload: wavBuffer.toString('base64')
                }));
            }
        } catch (e) {}
    });

    clientWs.on('close', () => openAiWs.close());
    openAiWs.on('close', () => clientWs.close());
}

// -----------------------------------------------------
// 🛠️ HERRAMIENTAS DE CONVERSIÓN
// -----------------------------------------------------
function convertAndSend(inputBuffer, openAiWs) {
    const inputStream = new Readable();
    inputStream.push(inputBuffer);
    inputStream.push(null);

    ffmpeg(inputStream)
        .inputFormat('m4a') 
        .audioFrequency(24000) 
        .audioChannels(1)
        .format('s16le') 
        .on('error', (err) => console.error('Error FFMPEG:', err))
        .pipe() 
        .on('data', (chunk) => {
            if(openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.send(JSON.stringify({
                    type: "input_audio_buffer.append",
                    audio: chunk.toString('base64')
                }));
            }
        })
        .on('end', () => {
            if(openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.send(JSON.stringify({type: "input_audio_buffer.commit"}));
                openAiWs.send(JSON.stringify({type: "response.create"}));
            }
        });
}

function toWav(pcmData) {
    const numChannels = 1;
    const sampleRate = 24000;
    const byteRate = sampleRate * numChannels * 2;
    const blockAlign = numChannels * 2;
    const dataSize = pcmData.length;
    const buffer = Buffer.alloc(44 + dataSize);
    
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); 
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(16, 34); 
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    
    pcmData.copy(buffer, 44);
    return buffer;
}