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

console.log(`🚀 SERVIDOR V25 (PARROT MODE): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Header WAV estándar (24kHz, 16bit, Mono)
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
                console.log("🎙️ Iniciando Live V25...");
                
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
                            // 🔥 INSTRUCCIÓN AGRESIVA PARA QUE HABLE SÍ O SÍ
                            instructions: `You are a PARROT. 
                            1. You MUST generate an AUDIO response.
                            2. If you hear speech, repeat it exactly.
                            3. If you hear silence or noise, say "SONIDO RECIBIDO" loudly in Spanish.
                            4. NEVER remain silent.`,
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

                    // Log para ver si la IA está mandando texto en lugar de audio
                    if (response.type === 'response.text.delta') {
                        console.log("📝 IA Dice (Texto):", response.delta);
                    }

                    if (response.type === 'response.audio.delta' && response.delta) {
                        const pcmBuffer = Buffer.from(response.delta, 'base64');
                        const header = createWavHeader(pcmBuffer.length);
                        const wavBuffer = Buffer.concat([header, pcmBuffer]);
                        
                        console.log(`🔊 ENVIANDO AUDIO (${wavBuffer.length} bytes)`);
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
                        // Dejamos auto-detect para Samsung
                        .audioFrequency(24000)
                        .audioChannels(1)
                        .audioCodec('pcm_s16le')
                        .format('s16le')
                        .save(tempOut)
                        .on('end', () => {
                            if (fs.existsSync(tempOut)) {
                                const pcmData = fs.readFileSync(tempOut);
                                
                                if (pcmData.length < 500) {
                                    console.log("⚠️ Audio vacío/corrupto.");
                                    return;
                                }

                                console.log(`✅ FFMPEG OK (${pcmData.length}) -> Enviando...`);
                                
                                // 1. Enviar Audio
                                openAiWs.send(JSON.stringify({
                                    type: "input_audio_buffer.append",
                                    audio: pcmData.toString('base64')
                                }));
                                
                                // 2. Espera de seguridad (1s) para que la IA procese
                                setTimeout(() => {
                                    console.log("🚀 EJECUTANDO ORDEN DE HABLAR");
                                    openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
                                    openAiWs.send(JSON.stringify({ 
                                        type: 'response.create',
                                        response: { modalities: ["audio", "text"] } // Forzar modalidad
                                    }));
                                }, 800);

                                try { fs.unlinkSync(tempIn); fs.unlinkSync(tempOut); } catch(e){}
                            }
                        })
                        .on('error', (err) => {
                            console.error("❌ FFMPEG Error:", err);
                            try { fs.unlinkSync(tempIn); } catch(e){}
                        });
                } catch (e) { console.error("FS Error:", e); }
            }
            // (El código del chat clásico puede ir aquí abajo igual que en versiones anteriores)
        } catch (e) { console.error("Error General:", e.message); }
    });

    ws.on('close', () => { if (openAiWs) openAiWs.close(); });
});