import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🧠 CEREBRO COMPLETO (MODOS + PRECISIÓN): Listo en puerto ${PORT}`);

const tempDir = path.resolve('temp_audio');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🗺️ MAPA DE IDIOMAS (Para guiar a Whisper y evitar el "Turco")
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Japonés': 'ja', 
    'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 
    'Portugués': 'pt', 'Chino': 'zh'
};

function getIsoCode(fullLang) {
    const cleanName = fullLang.split(' ')[0]; 
    return ISO_LANGS[cleanName] || 'en';
}

wss.on('connection', (ws) => {
    console.log('📱 App conectada');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            // === DATOS DE LA APP ===
            const myLang = data.my_lang || "Español";
            const targetLang = data.language || "Inglés";
            const chosenTone = data.tone || "Neutral";
            const chosenVoice = data.voice || "alloy";
            const mode = data.mode || "interpreter"; // 👈 AQUÍ ESTÁ EL MODO

            // === 🎤 AUDIO ===
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                const buffer = Buffer.from(data.payload, 'base64');
                fs.writeFileSync(inputPath, buffer);

                // 1. Preparamos el "Prompt Guía" para Whisper
                // Esto es lo que evita que alucine idiomas raros. Le decimos: "Solo espera estos dos".
                const langA = getIsoCode(myLang);
                const langB = getIsoCode(targetLang);
                
                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    // 🛑 TRUCO PRO: No forzamos 'language' (porque rompería el 1 a 1),
                    // pero usamos el PROMPT para decirle qué idiomas son válidos.
                    prompt: `The audio is a conversation strictly in ${myLang} or ${targetLang}. Ignora ruidos de fondo o silencio.`,
                    temperature: 0 // Temperatura 0 hace que sea lo más preciso posible
                });

                const userText = transcription.text;
                fs.unlinkSync(inputPath);

                // Filtro de ruido: Si escuchó menos de 2 caracteres, lo ignoramos.
                if (!userText || userText.trim().length < 2) return; 

                console.log(`👂 (${mode}) Escuché: "${userText}"`);

                // 2. LÓGICA DE MODOS (RESTAURADA)
                let systemPrompt = "";

                if (mode === 'interpreter') {
                    // === MODO 1 A 1 (PING PONG) ===
                    systemPrompt = `
                        Eres un intérprete experto.
                        
                        CONTEXTO:
                        - Usuario habla: ${myLang}
                        - Interlocutor habla: ${targetLang}

                        TU TAREA:
                        1. Analiza el texto: "${userText}"
                        2. Si está en ${myLang} -> Tradúcelo al ${targetLang}.
                        3. Si está en ${targetLang} -> Tradúcelo al ${myLang}.
                        
                        Mantén el tono: ${chosenTone}. 
                        IMPORTANTE: Solo devuelve la traducción exacta. No des explicaciones.
                    `;
                } else {
                    // === MODO AUTO (GRUPO / VIAJE) ===
                    // Todo lo que escuche (en cualquier idioma) va al idioma del usuario
                    systemPrompt = `
                        Eres un asistente de traducción personal.
                        Tu dueño solo habla: ${myLang}.
                        
                        TU TAREA:
                        Escucha: "${userText}".
                        Si NO está en ${myLang}, tradúcelo al ${myLang}.
                        Si YA está en ${myLang}, solo repítelo o mejóralo ligeramente.

                        Tono: ${chosenTone}. Solo la traducción.
                    `;
                }

                const completion = await openai.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userText }
                    ],
                    model: "gpt-4o",
                    temperature: 0.3, // Precisión alta
                });

                const aiText = completion.choices[0].message.content;
                sendResponse(ws, userText, aiText, chosenTone, chosenVoice);
            }

            // === 👁️ VISIÓN (Igual que antes, optimizado) ===
            if (data.type === 'image_input') {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Traduce texto o describe imagen en ${myLang}. Tono: ${chosenTone}.` }, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}`, detail: "auto" } } 
                        ]}
                    ],
                });
                const aiText = response.choices[0].message.content;
                sendResponse(ws, "📸 (Imagen)", aiText, chosenTone, chosenVoice);
            }

        } catch (error) { console.error("Error:", error.message); }
    });
});

async function sendResponse(ws, userText, aiText, tone, voice = 'alloy') {
    const mp3 = await openai.audio.speech.create({ 
        model: "tts-1", 
        voice: voice, 
        input: aiText, 
        speed: 1.1 
    });
    
    const audioBuffer = Buffer.from(await mp3.arrayBuffer());
    
    ws.send(JSON.stringify({ 
        type: 'full_response', 
        user_text: userText, 
        ai_text: aiText, 
        tone: tone, 
        audio_payload: audioBuffer.toString('base64') 
    }));
}