import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// ✅ FFMPEG
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V28 (AMPLIFICADOR 15x): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

function createWavHeader(dataLength) {
    const sampleRate = 24000;
    const buffer = Buffer.alloc(44);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); 
    buffer.writeUInt16LE(1, 20); 
    buffer.writeUInt16LE(1, 22); 
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32); 
    buffer.writeUInt16LE(16, 34); 
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    let openAiWs = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Iniciando Live V28...");
                
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                openAiWs.on('open', () => {
                    console.log("✅ OpenAI Conectado");
                    ws.send(JSON.stringify({ type: 'debug', msg: 'IA Conectada 🟢' }));

                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: "You are a loud translator.", 
                            voice: "alloy",
                            input_audio_format: "pcm16",
                            output_audio_format: "pcm16",
                            turn_detection: null // Manual
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                openAiWs.on('message', (openaiMsg) => {
                    const response = JSON.parse(openaiMsg);
                    
                    if (response.type === 'error') {
                        console.error("❌ ERROR IA:", response.error.message);
                    }

                    if (response.type === 'response.text.delta') {
                        console.log("📝 TEXTO IA:", response.delta);
                    }

                    if (response.type === 'response.audio.delta' && response.delta) {
                        const pcmBuffer = Buffer.from(response.delta, 'base64');
                        const header = createWavHeader(pcmBuffer.length);
                        const wavBuffer = Buffer.concat([header, pcmBuffer]);
                        
                        process.stdout.write('🔊'); // Indicador visual de audio
                        ws.send(JSON.stringify({ type: 'audio_stream', audio: wavBuffer.toString('base64') }));
                    }
                });
            }

            else if (data.type === 'audio_input' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                console.log(`📨 RECIBIDO: ${data.payload.length} bytes`);

                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `live_${Date.now()}_${Math.random()}.m4a`);
                const tempOut = path.join(tempDir, `live_${Date.now()}_${Math.random()}.raw`);

                try {
                    fs.writeFileSync(tempIn, inputBuffer);
                    
                    ffmpeg(tempIn)
                        // 🔥 AMPLIFICACIÓN EXTREMA (15x)
                        .audioFilters('volume=15.0') 
                        .audioFrequency(24000)
                        .audioChannels(1)
                        .audioCodec('pcm_s16le')
                        .format('s16le')
                        .save(tempOut)
                        .on('end', () => {
                            if (fs.existsSync(tempOut)) {
                                const pcmData = fs.readFileSync(tempOut);
                                
                                console.log(`✅ FFMPEG OK (BOOSTED) -> Enviando...`);
                                
                                // 1. Enviar Audio
                                openAiWs.send(JSON.stringify({
                                    type: "input_audio_buffer.append",
                                    audio: pcmData.toString('base64')
                                }));
                                
                                // 2. COMMIT + ORDEN FORZADA
                                setTimeout(() => {
                                    console.log("🚀 ORDENANDO RESPUESTA...");
                                    openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
                                    
                                    // 🔥 ORDEN ESPECÍFICA PARA ESTE TURNO
                                    openAiWs.send(JSON.stringify({ 
                                        type: 'response.create',
                                        response: {
                                            modalities: ["audio", "text"],
                                            instructions: "Repeat exactly what you heard. If you heard nothing, shout 'AUDIO VACIO'."
                                        }
                                    }));
                                }, 500);

                                try { fs.unlinkSync(tempIn); fs.unlinkSync(tempOut); } catch(e){}
                            }
                        })
                        .on('error', (err) => {
                            console.error("❌ FFMPEG Error:", err);
                            try { fs.unlinkSync(tempIn); } catch(e){}
                        });
                } catch (e) { console.error("FS Error:", e); }
            }
            
            // CHAT CLÁSICO (Código existente abajo...)
            else if (['audio_input', 'text_input'].includes(data.type) && !openAiWs) {
                 await handleClassicRequest(ws, data);
            }

        } catch (e) { console.error("Error General:", e.message); }
    });

    ws.on('close', () => { if (openAiWs) openAiWs.close(); });
});

// Función Classic (Mantenla en tu archivo)
async function handleClassicRequest(ws, data) {
    try {
        // ... (Tu código de chat clásico V21 aquí) ...
        // Simplificado para ahorrar espacio en el chat, pero asegúrate de tenerlo.
        const completion = await openai.chat.completions.create({
             messages: [{ role: "user", content: data.text || "Hello" }],
             model: "gpt-4o"
        });
        // ... TTS ...
    } catch(e) {}
}