import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🧠 CEREBRO PREMIUM (COREANO + ANTI-ALUCINACIONES): Listo en puerto ${PORT}`);

const tempDir = path.resolve('temp_audio');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🚫 LISTA NEGRA DE ALUCINACIONES (Whisper Ghosts)
// Si el audio dice esto, lo ignoramos automáticamente para NO gastar dinero en traducciones falsas.
const HALLUCINATION_BLACKLIST = [
    "Amara.org", "Subtitle", "Subtítulos", "albertoplasencia", 
    "Thanks for watching", "Gracias por ver", "suscríbete", "subscribe",
    "like and subscribe", "dale like", "comment below", "moo", 
    "MBC", "SBS", "copyright", "All rights reserved", "©"
];

// 🗺️ MAPA DE IDIOMAS (AHORA INCLUYE COREANO 🇰🇷)
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Japonés': 'ja', 
    'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 
    'Portugués': 'pt', 'Chino': 'zh', 'Coreano': 'ko' 
};

wss.on('connection', (ws) => {
    console.log('📱 Cliente Premium conectado');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            // === DATOS DE LA APP ===
            const myLang = data.my_lang || "Español";
            const targetLang = data.language || "Inglés";
            const chosenTone = data.tone || "Neutral";
            const chosenVoice = data.voice || "alloy";
            const mode = data.mode || "interpreter"; 

            // === 🎤 AUDIO INPUT (EL CEREBRO DE LA TRADUCCIÓN) ===
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                const buffer = Buffer.from(data.payload, 'base64');
                fs.writeFileSync(inputPath, buffer);

                // 1. TRANSCRIPCIÓN CON WHISPER (Con Prompt Anti-Alucinaciones)
                // Le damos una pista a Whisper de que puede haber Coreano.
                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    prompt: `Silence. Conversation in ${myLang}, ${targetLang} and Korean.`, 
                    temperature: 0, // Cero creatividad para evitar inventos
                    language: ISO_LANGS[myLang.split(' ')[0]] // Ayudamos a enfocar el idioma
                });

                const userText = transcription.text;
                fs.unlinkSync(inputPath);

                // 🛡️ FILTRO 1: LIMPIEZA INMEDIATA (AHORRO DE DINERO)
                // Si el texto está vacío o es una alucinación conocida, CORTAMOS AQUÍ.
                if (!userText || userText.trim().length < 2) return;
                
                const isGhost = HALLUCINATION_BLACKLIST.some(phrase => 
                    userText.toLowerCase().includes(phrase.toLowerCase())
                );
                
                if (isGhost) {
                    console.log(`👻 Alucinación detectada y bloqueada: "${userText}"`);
                    return; // ¡AQUÍ MATAMOS EL ERROR! No llamamos a GPT-4o ni gastamos más.
                }

                console.log(`👂 Usuario dijo: "${userText}"`);

                // 2. EL INTÉRPRETE DE ÉLITE (GPT-4o)
                // Incluye reglas específicas para Coreano (Honoríficos vs Informal)
                let systemPrompt = "";

                if (mode === 'interpreter') {
                    systemPrompt = `
                        ACTÚA COMO UN INTÉRPRETE HUMANO DE ÉLITE (Nivel ONU).
                        
                        CONTEXTO:
                        - Usuario (Cliente VIP): Habla ${myLang}.
                        - Interlocutor: Habla ${targetLang}.
                        - Tono deseado: ${chosenTone}.

                        TUS REGLAS INQUEBRANTABLES:
                        1. IDENTIFICA EL IDIOMA: Si el texto "${userText}" está en ${myLang}, tradúcelo al ${targetLang}. Si está en ${targetLang}, al ${myLang}.
                        2. CALIDAD PREMIUM: No traduzcas palabra por palabra. Adapta modismos, frases hechas y contexto cultural. Que suene 100% natural.
                        3. COREANO 🇰🇷: Si traduces al Coreano y el tono es "Formal", usa honoríficos (Hasip-sio/Seumnida). Si es "Barrio", usa Banmal.
                        4. SEGURIDAD: Si el texto parece un subtítulo de TV ("Sincronizado por...", "Gracias por ver"), RESPONDE SOLAMENTE CON LA PALABRA "BLOCK".
                        
                        SOLO devuelve la traducción final. Nada más.
                    `;
                } else {
                    systemPrompt = `
                        Eres el Traductor Personal de un ejecutivo.
                        Tu dueño habla: ${myLang}.
                        
                        INSTRUCCIONES:
                        - Escucha: "${userText}".
                        - Si NO está en ${myLang}, tradúcelo al ${myLang} con fluidez perfecta.
                        - Si YA está en ${myLang}, mejóralo gramaticalmente o repítelo para confirmación.
                        - Si detectas frases basura como "Suscríbete" o "Amara.org", responde "BLOCK".
                        
                        Mantén el tono: ${chosenTone}.
                    `;
                }

                const completion = await openai.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userText }
                    ],
                    model: "gpt-4o", // El modelo más potente
                    temperature: 0.3, 
                });

                const aiText = completion.choices[0].message.content;

                // 🛡️ FILTRO 2: EL BLOQUEO DE INTELIGENCIA
                if (aiText.includes("BLOCK") || aiText.trim() === "") {
                    console.log("🛡️ GPT detectó basura. Bloqueando respuesta.");
                    return;
                }

                sendResponse(ws, userText, aiText, chosenTone, chosenVoice);
            }

            // === 👁️ VISIÓN (LECTOR DE TEXTO MEJORADO) ===
            if (data.type === 'image_input') {
                console.log("📸 Analizando imagen con visión experta...");
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `
                                TAREA: TRADUCCIÓN VISUAL DE ALTA PRECISIÓN.
                                
                                1. ANALIZA la imagen buscando cualquier texto (menús, carteles, documentos).
                                2. EXTRAE el texto completo.
                                3. TRADÚCELO al ${myLang} manteniendo el formato original (listas, párrafos).
                                4. Si NO hay texto, describe la escena artísticamente.
                                
                                Tono: ${chosenTone}.
                            `}, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}`, detail: "high" } } 
                        ]}
                    ],
                    max_tokens: 400, 
                });
                const aiText = response.choices[0].message.content;
                sendResponse(ws, "📸 Imagen analizada", aiText, chosenTone, chosenVoice);
            }

        } catch (error) { console.error("Error crítico:", error.message); }
    });
});

async function sendResponse(ws, userText, aiText, tone, voice = 'alloy') {
    // Velocidad adaptativa: Si es largo, habla un 15% más rápido para fluidez.
    const speed = aiText.length > 120 ? 1.15 : 1.0;

    try {
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1-hd", // 🔥 HD PARA MÁXIMA CALIDAD HUMANA
            voice: voice, 
            input: aiText, 
            speed: speed 
        });
        
        const audioBuffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: userText, 
            ai_text: aiText, 
            tone: tone, 
            audio_payload: audioBuffer.toString('base64') 
        }));
    } catch (e) {
        console.error("Error generando audio:", e);
    }
}