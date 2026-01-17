import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import stringSimilarity from 'string-similarity';

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR MAESTRO V71 (PERMISIVO + ANTI-LEAK): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🗑️ LISTA NEGRA (Solo bloqueamos basura real y alucinaciones técnicas)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    // Filtros de Prompt Leak (para que no repita instrucciones)
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", "Direct conversation"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    ws.lastAiResponse = ""; 

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') return;

            // =================================================================
            // 🎙️ AUDIO INPUT
            // =================================================================
            if (data.type === 'audio_input') {
                const rawLangA = data.langSource || data.my_lang || "Español";
                const rawLangB = data.langTarget || data.target_lang_code || "Inglés";
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // 1. WHISPER (Con Prompt Seguro "Anti-Lecture")
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        // Usamos palabras sueltas para evitar que lea la instrucción
                        prompt: "Hello. Hola. Conversation. Dialogue. Si. No.", 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // 2. FILTROS DE BASURA TÉCNICA
                    if (/(.)\1{4,}/.test(userText)) { try { fs.unlinkSync(tempIn); } catch(e){} return; } 

                    const lowerText = userText.toLowerCase();
                    
                    // Si es basura confirmada, adiós.
                    if (userText.length === 0 || HALLUCINATION_TRIGGERS.some(trigger => lowerText.includes(trigger.toLowerCase()))) {
                        console.log(`🔇 Alucinación bloqueada: "${userText}"`); 
                        try { fs.unlinkSync(tempIn); } catch(e){} return; 
                    }

                    // 3. ANTI-ECO RELAJADO (AQUÍ ESTÁ EL CAMBIO) 🔥
                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(lowerText, ws.lastAiResponse.toLowerCase());
                        
                        // ANTES: > 0.5 (Muy estricto, bloqueaba frases parecidas)
                        // AHORA: > 0.85 (Solo bloquea si es PRÁCTICAMENTE IDÉNTICO)
                        if (similarity > 0.85) {
                            console.log(`☢️ Eco IDÉNTICO ignorado.`);
                            try { fs.unlinkSync(tempIn); } catch(e){} return; 
                        }
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // 4. CEREBRO TRADUCTOR (GPT-4o) - BIDIRECCIONAL ESTRICTO
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT BIDIRECTIONAL INTERPRETER.
                                
                                LANGUAGES: ${rawLangA} <-> ${rawLangB}
                                
                                ALGORITHM:
                                1. IDENTIFY the language of the user input.
                                2. SWITCH to the OTHER language.
                                3. OUTPUT only the translation.
                                
                                RULES:
                                - Translate EVERYTHING the user says (even repeats).
                                - NEVER output the same language as the input. 
                                - If input is unintelligible noise, output "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 200
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    if (aiText === "SILENCE" || !aiText || aiText.trim().length === 0) {
                        try { fs.unlinkSync(tempIn); } catch(e){} return;
                    }

                    // VALIDACIÓN: Si la IA repite exactamente lo mismo, es un error de "Loro".
                    if (aiText.toLowerCase().replace(/[.,!]/g, '').trim() === userText.toLowerCase().replace(/[.,!]/g, '').trim()) {
                        console.log("⚠️ La IA intentó repetir (Loro). Bloqueado.");
                        try { fs.unlinkSync(tempIn); } catch(e){} return;
                    }

                    console.log(`🧠 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 5. VOZ (TTS)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", voice: "alloy", input: aiText, response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    const audioBase64 = bufferTTS.toString('base64');

                    ws.send(JSON.stringify({ type: 'audio_stream', audio: audioBase64 }));
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: audioBase64 }));

                    try { fs.unlinkSync(tempIn); } catch(e){}

                } catch (error) { try { fs.unlinkSync(tempIn); } catch(e){} }
            }
            
            // =================================================================
            // 📝 CHAT INPUT (INTACTO)
            // =================================================================
            else if (data.type === 'text_input') {
                const langA = data.my_lang || "Español";
                const langB = data.language || "Inglés";
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: `Translate from ${langA} to ${langB} (or vice versa). Output ONLY translation.` }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini"
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                    const buffer = Buffer.from(await mp3.arrayBuffer());
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio_payload: buffer.toString('base64') }));
                } catch(e) {}
            }
             else if (data.type === 'image_input') {
                 // CAMARA INTACTA
                 const langTarget = data.language || "English";
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o", 
                         messages: [{ role: "user", content: [{ type: "text", text: `Look for ANY text in this image. If found, TRANSLATE it to ${langTarget}. If there is NO text, briefly describe what you see in ${langTarget}. Output ONLY the result.` }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }] }],
                         max_tokens: 150,
                     });
                     const aiText = response.choices[0].message.content;
                     const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                     const buffer = Buffer.from(await mp3.arrayBuffer());
                     ws.send(JSON.stringify({ type: 'full_response', user_text: "📸 [Imagen Analizada]", ai_text: aiText, audio_payload: buffer.toString('base64') }));
                 } catch (e) {}
             }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});