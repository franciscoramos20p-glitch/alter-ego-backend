import React, { useState, useEffect, useRef } from 'react'; 
import { StatusBar, Platform, AppState, View, ActivityIndicator, Text, Alert, Linking, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'; 
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack'; 
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage'; 

import Purchases from 'react-native-purchases';
import mobileAds from 'react-native-google-mobile-ads';

import { CreditManager } from './src/views/CreditManager'; 
import { REVENUECAT_API_KEY } from './constants/LiveConfig'; 

import { ThemeProvider, useTheme } from './constants/ThemeContext';

import ClassicScreen from './src/views/ClassicScreen';
import LiveScreen from './src/views/LiveScreen';
import CameraScreen from './src/views/CameraScreen'; 
import FaceToFaceScreen from './src/views/FaceToFaceScreen'; 
import SimulatorScreen from './src/views/SimulatorScreen';
import SimulatorChat from './src/views/SimulatorChat';
import SimulatorVault from './src/views/SimulatorVault'; 
import SimulatorVaultChat from './src/views/SimulatorVaultChat';

const FIREBASE_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com';
const APP_CURRENT_VERSION = 5; 
const STORE_URL = 'https://play.google.com/store/apps/details?id=com.francisco_68.alteregopro'; 

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator(); 

// =====================================================================
// 🚀 PANTALLA DE BIENVENIDA (ONBOARDING) PARA USUARIOS NUEVOS
// =====================================================================
function OnboardingScreen({ navigation }) {
    const { theme, isDarkMode } = useTheme();
    const insets = useSafeAreaInsets();

    const finishOnboarding = async () => {
        navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
        });
    };

    return (
        <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: Math.max(insets.top, 40), paddingBottom: Math.max(insets.bottom, 20) }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 25, flexGrow: 1, justifyContent: 'center' }}>
                
                <View style={{ alignItems: 'center', marginBottom: 40 }}>
                    <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: isDarkMode ? 'rgba(0, 229, 255, 0.1)' : 'rgba(0, 151, 167, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                        <MaterialCommunityIcons name="robot-outline" size={45} color={theme.primary} />
                    </View>
                    <Text style={{ color: theme.text, fontSize: 28, fontWeight: '900', letterSpacing: 1, textAlign: 'center' }}>
                        INTERPRETER <Text style={{ color: theme.primary }}>AI</Text>
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 16, textAlign: 'center', marginTop: 10, lineHeight: 22 }}>
                        Tu intérprete personal con Inteligencia Artificial.
                    </Text>
                </View>

                <View style={{ gap: 25, marginBottom: 50 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="mic" size={32} color={theme.primary} />
                        <View style={{ marginLeft: 15, flex: 1 }}>
                            <Text style={{ color: theme.text, fontSize: 16, fontWeight: 'bold' }}>Traducción de Voz Mágica</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 2 }}>Habla naturalmente y la IA te traducirá al instante.</Text>
                        </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="camera" size={32} color={theme.primary} />
                        <View style={{ marginLeft: 15, flex: 1 }}>
                            <Text style={{ color: theme.text, fontSize: 16, fontWeight: 'bold' }}>Escáner Visual</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 2 }}>Apunta a menús o carteles y tradúcelos al segundo.</Text>
                        </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDarkMode ? '#1C1C1E' : '#F2F2F7', padding: 15, borderRadius: 15 }}>
                        <Ionicons name="flash" size={32} color="#FFD700" />
                        <View style={{ marginLeft: 15, flex: 1 }}>
                            <Text style={{ color: theme.text, fontSize: 16, fontWeight: 'bold' }}>INTERPRETE AI</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 2 }}>Disfruta de <Text style={{fontWeight: 'bold', color: theme.text}}>el traductor ilimitado gratuitos con anuncios</Text> o suscríbete a VIP para uso ilimitado de todas sus funciones y sin anuncios.</Text>
                        </View>
                    </View>
                </View>

                <TouchableOpacity 
                    onPress={finishOnboarding}
                    style={{ backgroundColor: theme.primary, paddingVertical: 18, borderRadius: 30, alignItems: 'center', shadowColor: theme.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 }}
                >
                    <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 }}>Empezar Ahora</Text>
                </TouchableOpacity>

            </ScrollView>
        </View>
    );
}

function MainTabs() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
        sceneContainerStyle={{ backgroundColor: theme.background }} 
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: { 
            backgroundColor: theme.header, 
            borderTopColor: theme.border,
            height: 60 + Math.max(insets.bottom, 10),
            paddingBottom: Math.max(insets.bottom, 10),
            paddingTop: 10,
            elevation: 0, 
            shadowOpacity: 0 
          },
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textSecondary,
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            if (route.name === 'Traductor') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
            else if (route.name === 'Escáner') iconName = focused ? 'camera' : 'camera-outline';
            else if (route.name === 'Intérprete') iconName = focused ? 'radio' : 'radio-outline';
            else if (route.name === 'Simulador') iconName = focused ? 'headset' : 'headset-outline';
            
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Traductor" component={ClassicScreen} />
        <Tab.Screen name="Escáner" component={CameraScreen} />
        <Tab.Screen name="Intérprete" component={LiveScreen} />
        <Tab.Screen name="Simulador" component={SimulatorScreen} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { theme, isDarkMode } = useTheme();
  const appState = useRef(AppState.currentState); 
  const [isAppReady, setIsAppReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState('MainTabs'); 
  
  const isProRef = useRef(false);
  const timeoutIdRef = useRef(null);

  const baseTheme = isDarkMode ? DarkTheme : DefaultTheme;
  const dynamicTheme = {
    ...baseTheme, 
    colors: {
      ...baseTheme.colors,
      primary: theme.primary,
      background: theme.background,
      card: theme.header,
      text: theme.text,
      border: theme.border,
      notification: theme.primary,
    },
  };

  // 🔥 SINCRONIZADOR ALINEADO CON REVENUECAT Y EL SERVIDOR 🔥
  const syncFirebaseStatus = async (status) => {
    try {
        const rcUserId = await Purchases.getAppUserID();
        if (rcUserId) {
            await fetch(`${FIREBASE_URL}/users/${rcUserId}/isPro.json`, {
                method: 'PUT',
                body: JSON.stringify(status)
            });
        }
    } catch (e) {
        console.log("Error sincronizando Firebase desde App.js");
    }
  };

  useEffect(() => {
    const proceedToApp = () => {
        if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
        setIsAppReady(true);
    };

    timeoutIdRef.current = setTimeout(() => {
        proceedToApp();
    }, 3000);

    const checkForUpdates = async () => {
        try {
            const response = await fetch(`${FIREBASE_URL}/config.json?nocache=${Date.now()}`);
            if (!response.ok) return false;
            
            const data = await response.json();
            
            if (data && data.min_version && APP_CURRENT_VERSION < data.min_version) {
                Alert.alert(
                    data.update_title || "Actualización Requerida",
                    data.update_message || "Hay una nueva versión disponible. Por favor, actualiza la app para continuar.",
                    [
                        { 
                            text: "Actualizar Ahora", 
                            onPress: () => {
                                Linking.openURL(STORE_URL).catch(() => {
                                    Alert.alert("Error", "No se pudo abrir la tienda de aplicaciones.");
                                });
                                setTimeout(checkForUpdates, 1000); 
                            }
                        }
                    ],
                    { cancelable: false }
                );
                return true; 
            }
        } catch (error) {
            console.log("Error verificando actualizaciones", error);
        }
        return false;
    };

    const startAppFast = async () => {
        try {
            const needsUpdate = await checkForUpdates();
            if (needsUpdate) {
                if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current); 
                return; 
            }

            const hasLaunchedBefore = await AsyncStorage.getItem('has_launched_before_v1');
            let isFirstLaunch = false;
            
            if (hasLaunchedBefore === null) {
                isFirstLaunch = true;
                await AsyncStorage.setItem('has_launched_before_v1', 'true');
                setInitialRoute('Onboarding'); 
            }

            if (Platform.OS === 'ios' || Platform.OS === 'android') {
                await mobileAds().initialize(); 
                Purchases.configure({ apiKey: REVENUECAT_API_KEY }); 
                
                // 🔥 ELIMINAMOS LA DEPENDENCIA DEL ID LOCAL. DEJAMOS QUE RC USE LA CUENTA DE GOOGLE 🔥
                try {
                    await Purchases.logIn('app_user_' + (await Purchases.getAppUserID())); 
                } catch (rcError) {
                    console.log("⚠️ Error de logIn RevenueCat ignorado en el arranque:", rcError.message);
                }
            } else {
                await mobileAds().initialize();
            }

            let isUserPro = false;
            
            if (Platform.OS === 'ios' || Platform.OS === 'android') {
                const customerInfo = await Purchases.getCustomerInfo();
                const premiumEntitlement = customerInfo.entitlements.active['premium_access'];
                const isEntitlementActive = !!(premiumEntitlement && premiumEntitlement.isActive);
                
                const activeSubs = customerInfo.activeSubscriptions || [];
                const hasActiveSub = activeSubs.some(sub => 
                    sub.includes('alterego_pro_weekly') || 
                    sub.includes('alterego_pro_monthly') || 
                    sub.includes('alterego_pro_yearly')
                );

                isUserPro = isEntitlementActive && hasActiveSub;
            }

            isProRef.current = isUserPro; 

            // AL ARRANCAR, VALIDAMOS CON LA TIENDA
            if (isUserPro) {
                CreditManager.activatePro();
                syncFirebaseStatus(true); 
            } else {
                CreditManager.deactivatePro();
                syncFirebaseStatus(false); 
            }
            
            proceedToApp();

            // 🔥 EL "PERRO GUARDIÁN": VIGILA EN TIEMPO REAL 🔥
            if (Platform.OS === 'ios' || Platform.OS === 'android') {
                Purchases.addCustomerInfoUpdateListener((info) => { 
                    const premiumEntitlement = info.entitlements.active['premium_access'];
                    const eActive = !!(premiumEntitlement && premiumEntitlement.isActive);
                    
                    const activeSubs = info.activeSubscriptions || [];
                    const hasActiveSub = activeSubs.some(sub => 
                        sub.includes('alterego_pro_weekly') || 
                        sub.includes('alterego_pro_monthly') || 
                        sub.includes('alterego_pro_yearly')
                    );

                    const isReallyPro = eActive && hasActiveSub;
                    isProRef.current = isReallyPro; 

                    // SI HUBO REEMBOLSO O CANCELACIÓN, ESTO SALTA INMEDIATAMENTE
                    if (isReallyPro) {
                        CreditManager.activatePro(); 
                        syncFirebaseStatus(true);
                    } else {
                        CreditManager.deactivatePro(); 
                        syncFirebaseStatus(false);
                    }
                });
            }

        } catch (error) {
            console.error("❌ Error en arranque inicial: ", error);
            proceedToApp();
        }
    };

    startAppFast();

    const subscription = AppState.addEventListener('change', nextAppState => {
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, []);

  if (!isAppReady) {
      return (
          <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
              <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />
              <ActivityIndicator size="large" color={theme.primary} style={{ marginBottom: 20 }} />
              <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '900', letterSpacing: 3 }}>INICIANDO INTERPRETE...</Text>
          </View>
      );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <NavigationContainer theme={dynamicTheme}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.header} />
        
        <Stack.Navigator 
          initialRouteName={initialRoute} 
          screenOptions={{ 
            headerShown: false,
            contentStyle: { backgroundColor: theme.background } 
          }}
        >
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade' }} />
          
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ animation: 'fade' }} />
          
          <Stack.Screen name="FaceToFace" component={FaceToFaceScreen} options={{ animation: 'slide_from_bottom' }} />
          
          <Stack.Screen name="Simulator" component={SimulatorScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="SimulatorChat" component={SimulatorChat} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="SimulatorVault" component={SimulatorVault} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="SimulatorVaultChat" component={SimulatorVaultChat} options={{ animation: 'slide_from_right' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
    </SafeAreaProvider>
  );
}



Mira

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Application from 'expo-application'; 
import * as SecureStore from 'expo-secure-store';

// 🔥 URL Y CONFIGURACIÓN 🔥
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com';

const DEVICE_ID_KEY = 'alterego_secure_id_v5'; 
const DEVICE_PIN_KEY = 'alterego_secure_pin_v5'; 
const CREDITS_CACHE_KEY = 'alterego_credits_backup_v1'; 

const PERMANENT_DEVICE_ID_KEY = 'alterego_vault_id_v1'; 
const PRO_STATUS_KEY = 'alterego_pro_active_v1'; 
const PRO_USAGE_KEY = 'alterego_pro_minutes_v1'; 
const PRO_RESET_DATE_KEY = 'alterego_pro_reset_date_v1'; 
const PRO_LIMIT_MINUTES = 1800; 

const FREE_USAGE_KEY = 'alterego_free_daily_usage_v1';
const FREE_DATE_KEY = 'alterego_free_daily_date_v1';
const FREE_DAILY_LIMIT = 30; 

const FALLBACK_CREDITS = 60; 

let memoryCredits = 0.0;
let isPro = false; 
let proMinutesUsed = 0; 
let freeUsesToday = 0; 
let todayString = new Date().toDateString(); 

let listeners = [];
let syncInterval = null;
let lastLocalUpdateTimestamp = 0; 

// --- FUNCIONES AUXILIARES BLINDADAS ---

// 🔥 CONECTADO A TU CARPETA "config" EXACTAMENTE COMO EN TU FOTO 🔥
const getWelcomeCredits = async (isTrusted = true) => {
  try {
    const response = await fetch(`${FIREBASE_DB_URL}/config.json?nocache=${Date.now()}`);
    if (!response.ok) return isTrusted ? FALLBACK_CREDITS : 0;
    
    const data = await response.json();
    
    if (isTrusted) {
        // Dispositivos Reales (Lee los 900 de tu Firebase)
        return data && data.welcome_credits !== undefined ? parseFloat(data.welcome_credits) : FALLBACK_CREDITS;
    } else {
        // Dispositivos Sospechosos o Emuladores (Lee los 600 de tu Firebase)
        return data && data.untrusted_credits !== undefined ? parseFloat(data.untrusted_credits) : 0;
    }
  } catch (e) {
    return isTrusted ? FALLBACK_CREDITS : 0;
  }
};

// 🔥 EL DETECTOR DE PLACAS BASE (HUELLA DIGITAL INMUTABLE) 🔥
const getHardwareId = async () => {
    try {
        let hwId = null;
        
        if (Platform.OS === 'android') {
            hwId = typeof Application.getAndroidId === 'function' ? Application.getAndroidId() : Application.androidId;
        } else if (Platform.OS === 'ios') {
            hwId = await Application.getIosIdForVendorAsync();
        }

        if (hwId && String(hwId).trim() !== '' && String(hwId) !== 'null' && String(hwId) !== 'undefined') {
            return 'DEV-' + String(hwId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        }

        let savedVaultId = await SecureStore.getItemAsync(PERMANENT_DEVICE_ID_KEY);
        if (savedVaultId) {
            return savedVaultId;
        }

        const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
        const newId = "GHOST-" + randomPart;
        
        await SecureStore.setItemAsync(PERMANENT_DEVICE_ID_KEY, newId);
        return newId;

    } catch (e) {
        return "GHOST-ERR-" + Date.now().toString(36).toUpperCase(); 
    }
};

export const CreditManager = {
  getCredits: () => memoryCredits,
  isProActive: () => isPro, 
  getFreeUsesRemaining: () => Math.max(0, FREE_DAILY_LIMIT - freeUsesToday),

  activatePro: async () => {
      isPro = true;
      const savedUsage = await AsyncStorage.getItem(PRO_USAGE_KEY);
      const savedResetDate = await AsyncStorage.getItem(PRO_RESET_DATE_KEY);
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000; 

      if (!savedResetDate) {
          proMinutesUsed = 0;
          await AsyncStorage.setItem(PRO_USAGE_KEY, '0');
          await AsyncStorage.setItem(PRO_RESET_DATE_KEY, now.toString());
      } else {
          const lastReset = parseInt(savedResetDate, 10);
          if (now - lastReset >= thirtyDaysMs) {
              proMinutesUsed = 0;
              await AsyncStorage.setItem(PRO_USAGE_KEY, '0');
              await AsyncStorage.setItem(PRO_RESET_DATE_KEY, now.toString());
          } else {
              proMinutesUsed = savedUsage ? parseFloat(savedUsage) : 0;
          }
      }
      await AsyncStorage.setItem(PRO_STATUS_KEY, 'true');
      CreditManager.notify(); 
  },

  deactivatePro: async () => {
      isPro = false;
      await AsyncStorage.setItem(PRO_STATUS_KEY, 'false');
      CreditManager.notify(); 
  },

  checkDailyFreeLimit: async () => {
      try {
          const today = new Date().toDateString(); 
          const savedDate = await AsyncStorage.getItem(FREE_DATE_KEY);
          
          if (savedDate !== today) {
              freeUsesToday = 0;
              await AsyncStorage.setItem(FREE_USAGE_KEY, '0');
              await AsyncStorage.setItem(FREE_DATE_KEY, today);
              
              const id = await AsyncStorage.getItem(DEVICE_ID_KEY);
              if (id) {
                  fetch(`${FIREBASE_DB_URL}/users/${id}.json`, { 
                      method: 'PATCH', 
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ free_date: today, free_uses: 0 }) 
                  }).catch(err => console.log("Error reset diario:", err));
              }
          } else {
              const savedUsage = await AsyncStorage.getItem(FREE_USAGE_KEY);
              freeUsesToday = savedUsage ? parseInt(savedUsage, 10) : 0;
          }
      } catch (e) {}
  },

  initializeUser: async () => {
    try {
        todayString = new Date().toDateString(); 
        
        let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
        let pin = await AsyncStorage.getItem(DEVICE_PIN_KEY);

        if (!id) {
            console.log("🔄 DATOS BORRADOS O NUEVOS. ESCANEANDO HARDWARE...");
            
            const hardwareId = await getHardwareId(); 
            const checkRes = await fetch(`${FIREBASE_DB_URL}/users/${hardwareId}.json?nocache=${Date.now()}`);
            const existingData = await checkRes.json();

            if (existingData) {
                console.log("✅ TELÉFONO RECONOCIDO. DEVOLVIENDO CRÉDITOS Y PIN INTACTOS.");
                id = hardwareId;
                pin = existingData.pin;
                memoryCredits = existingData.credits !== undefined ? parseFloat(existingData.credits) : 0;
                
                if (existingData.free_date === todayString) {
                    freeUsesToday = existingData.free_uses !== undefined ? parseInt(existingData.free_uses) : 0;
                } else {
                    freeUsesToday = 0; 
                    fetch(`${FIREBASE_DB_URL}/users/${id}.json`, { 
                        method: 'PATCH', 
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ free_date: todayString, free_uses: 0 }) 
                    }).catch(()=>{});
                }
            } else {
                console.log("🆕 REGISTRANDO NUEVO DISPOSITIVO...");
                id = hardwareId;
                pin = Math.floor(100000 + Math.random() * 900000).toString();
                
                // 🔥 LA BARRERA ANTI-ABUSOS CON TUS PRECIOS DE FIREBASE 🔥
                const isTrusted = id.startsWith('DEV-');
                memoryCredits = await getWelcomeCredits(isTrusted); 

                if (isTrusted) {
                    console.log(`🎁 Dispositivo verificado. Bono otorgado: ${memoryCredits} (welcome_credits)`);
                } else {
                    console.log(`🛡️ Cuenta Fantasma detectada. Bono otorgado: ${memoryCredits} (untrusted_credits)`);
                }
                
                freeUsesToday = 0;
                
                await fetch(`${FIREBASE_DB_URL}/users/${id}.json`, { 
                    method: 'PUT', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ credits: memoryCredits, pin: pin, free_date: todayString, free_uses: 0 }) 
                });
            }

            await AsyncStorage.setItem(FREE_USAGE_KEY, String(freeUsesToday));
            await AsyncStorage.setItem(FREE_DATE_KEY, todayString);
            await AsyncStorage.setItem(DEVICE_ID_KEY, id);
            await AsyncStorage.setItem(DEVICE_PIN_KEY, pin);
            await AsyncStorage.setItem(CREDITS_CACHE_KEY, String(memoryCredits));
            await SecureStore.setItemAsync(PERMANENT_DEVICE_ID_KEY, id);
            
            CreditManager.notify();
            if (syncInterval) clearInterval(syncInterval);
            syncInterval = setInterval(() => { CreditManager.fetchFromCloud(id); }, 5000);

            return { id, pin };
        }
        
        await CreditManager.init();
        return { id, pin };
    } catch (e) { 
        console.error("❌ ERROR FATAL:", e);
        return null; 
    }
  },

  init: async () => {
    try {
      await CreditManager.checkDailyFreeLimit();
      todayString = new Date().toDateString();
      
      const id = await AsyncStorage.getItem(DEVICE_ID_KEY);
      const cached = await AsyncStorage.getItem(CREDITS_CACHE_KEY);
      
      const savedProStatus = await AsyncStorage.getItem(PRO_STATUS_KEY);
      isPro = (savedProStatus === 'true');
      const savedProUsage = await AsyncStorage.getItem(PRO_USAGE_KEY);
      if (savedProUsage) proMinutesUsed = parseFloat(savedProUsage);

      if (cached !== null) {
          memoryCredits = parseFloat(cached);
          CreditManager.notify(); 
      }
      if (id) {
        await CreditManager.fetchFromCloud(id);
        if (syncInterval) clearInterval(syncInterval);
        syncInterval = setInterval(() => {
            AsyncStorage.getItem(DEVICE_ID_KEY).then(currentId => {
                if(currentId) CreditManager.fetchFromCloud(currentId);
            });
        }, 5000); 
      }
    } catch (e) { console.log("Init Error:", e); }
    return memoryCredits;
  },

  fetchFromCloud: async (id) => {
      try {
        todayString = new Date().toDateString();
        const response = await fetch(`${FIREBASE_DB_URL}/users/${id}.json?nocache=${Date.now()}`);
        const data = await response.json();
        
        if (data) {
          const isLocked = (Date.now() - lastLocalUpdateTimestamp) < 6000;
          
          if (!isLocked) {
              if (data.credits !== undefined) {
                  const serverCredits = parseFloat(data.credits);
                  if (serverCredits !== memoryCredits) {
                      memoryCredits = serverCredits;
                      AsyncStorage.setItem(CREDITS_CACHE_KEY, String(memoryCredits));
                      CreditManager.notify();
                  }
              }

              if (data.free_date === todayString) {
                  const cloudUses = data.free_uses !== undefined ? parseInt(data.free_uses) : 0;
                  if (cloudUses !== freeUsesToday) {
                      freeUsesToday = cloudUses;
                      AsyncStorage.setItem(FREE_USAGE_KEY, String(freeUsesToday));
                      CreditManager.notify();
                  }
              } else {
                  freeUsesToday = 0;
                  AsyncStorage.setItem(FREE_USAGE_KEY, '0');
                  AsyncStorage.setItem(FREE_DATE_KEY, todayString);
                  
                  fetch(`${FIREBASE_DB_URL}/users/${id}.json`, { 
                      method: 'PATCH', 
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ free_date: todayString, free_uses: 0 }) 
                  }).catch(() => {});
                  CreditManager.notify();
              }
          }
        }
      } catch(e) {}
  },

  login: async (newId, newPin) => {
      try {
          todayString = new Date().toDateString();
          const response = await fetch(`${FIREBASE_DB_URL}/users/${newId}.json?nocache=${Date.now()}`);
          const data = await response.json();
          if (!data || String(data.pin) !== String(newPin)) return false;
          
          if (syncInterval) clearInterval(syncInterval);
          await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
          await AsyncStorage.setItem(DEVICE_PIN_KEY, newPin);
          await SecureStore.setItemAsync(PERMANENT_DEVICE_ID_KEY, newId);

          const isTrustedDevice = newId.startsWith('DEV-');
          memoryCredits = data.credits !== undefined ? parseFloat(data.credits) : await getWelcomeCredits(isTrustedDevice); 

          if (data.free_date === todayString) {
              freeUsesToday = data.free_uses !== undefined ? parseInt(data.free_uses) : 0;
          } else {
              freeUsesToday = 0;
          }
          
          await AsyncStorage.setItem(FREE_USAGE_KEY, String(freeUsesToday));
          await AsyncStorage.setItem(FREE_DATE_KEY, todayString);
          await AsyncStorage.setItem(CREDITS_CACHE_KEY, String(memoryCredits));
          
          CreditManager.notify();
          syncInterval = setInterval(() => { CreditManager.fetchFromCloud(newId); }, 5000);
          return true;
      } catch (e) { return false; }
  },

  setCredits: async (newAmount) => {
    const val = parseFloat(newAmount);
    if(isNaN(val)) return;
    
    lastLocalUpdateTimestamp = Date.now();
    memoryCredits = val;
    
    CreditManager.notify(); 
    AsyncStorage.setItem(CREDITS_CACHE_KEY, String(val)).catch(()=>{});
    try {
      const id = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (id) {
        fetch(`${FIREBASE_DB_URL}/users/${id}.json`, { 
            method: 'PATCH', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credits: val }) 
        }).catch(e => console.log("Error guardando creditos:", e));
      }
    } catch (e) {}
  },

  deduct: (amount) => {
    if (isPro && amount > 0) {
        const minutesSpent = amount / 1.2; 
        if (proMinutesUsed + minutesSpent <= PRO_LIMIT_MINUTES) {
            proMinutesUsed += minutesSpent;
            AsyncStorage.setItem(PRO_USAGE_KEY, String(proMinutesUsed)).catch(()=>{});
            return true; 
        }
    }

    if (amount === 0) {
        if (freeUsesToday < FREE_DAILY_LIMIT) {
            freeUsesToday++;
            lastLocalUpdateTimestamp = Date.now(); 
            const currentToday = new Date().toDateString();
            
            AsyncStorage.setItem(FREE_USAGE_KEY, String(freeUsesToday));
            
            AsyncStorage.getItem(DEVICE_ID_KEY).then(id => {
                if (id) {
                    fetch(`${FIREBASE_DB_URL}/users/${id}.json`, { 
                        method: 'PATCH', 
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ free_uses: freeUsesToday, free_date: currentToday }) 
                    });
                }
            });

            CreditManager.notify(); 
            return true; 
        } else {
            return false; 
        }
    }

    if (memoryCredits < amount) return false; 
    
    const newTotal = memoryCredits - amount;
    CreditManager.setCredits(newTotal); 
    return true; 
  },

  subscribe: (callback) => {
    listeners.push(callback);
    callback(memoryCredits); 
    return () => { listeners = listeners.filter(l => l !== callback); };
  },

  notify: () => { listeners.forEach(cb => cb(memoryCredits)); }
};

import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Animated, Platform } from 'react-native';
import { FontAwesome5, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Purchases from 'react-native-purchases';
import { RewardedAd, RewardedAdEventType, AdEventType, TestIds } from 'react-native-google-mobile-ads'; 
import * as Haptics from 'expo-haptics';

import { CreditManager } from '../../src/views/CreditManager'; 
import { PACKAGES, getDynamicPackages } from '../../constants/ClassicConfig'; 
import { useTheme } from '../../constants/ThemeContext';

const FIREBASE_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com';

const adUnitId = __DEV__ ? TestIds.REWARDED : 'ca-app-pub-4189540256848714/1393439575'; 
const rewarded = RewardedAd.createForAdRequest(adUnitId);

export default function PaywallModal({ visible, onClose, onPurchaseSuccess, onPurchaseError, translations }) {
    const t = translations || {};
    const { theme, isDarkMode } = useTheme();
    
    const [isPro, setIsPro] = useState(false); 
    const [isRestoring, setIsRestoring] = useState(false); 
    const [isAdLoaded, setIsAdLoaded] = useState(false);
    
    const [realPackages, setRealPackages] = useState([]); 
    const [dynamicPacks, setDynamicPacks] = useState(PACKAGES);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const [bonuses, setBonuses] = useState({
        weekly: { amount: 0, active: false },
        monthly: { amount: 0, active: false },
        yearly: { amount: 0, active: false }
    });

    const syncProStatusToFirebase = async (status) => {
        try {
            const rcUserId = await Purchases.getAppUserID(); 
            if (rcUserId) {
                await fetch(`${FIREBASE_URL}/users/${rcUserId}/isPro.json`, {
                    method: 'PUT',
                    body: JSON.stringify(status)
                });
            }
        } catch (e) {
            console.log("Error sincronizando con Firebase", e);
        }
    };

    const fetchFirebaseConfig = async () => {
        try {
            const res = await fetch(`${FIREBASE_URL}/config.json`);
            const configData = await res.json();
            
            if (configData) {
                setBonuses({
                    weekly: {
                        amount: configData.bonus_weekly ? parseInt(configData.bonus_weekly) : 0,
                        active: String(configData.enable_weekly_bonus) === 'true'
                    },
                    monthly: {
                        amount: configData.bonus_monthly ? parseInt(configData.bonus_monthly) : 0,
                        active: String(configData.enable_monthly_bonus) === 'true'
                    },
                    yearly: {
                        amount: configData.bonus_yearly ? parseInt(configData.bonus_yearly) : 0,
                        active: String(configData.enable_yearly_bonus) === 'true'
                    }
                });
            }
        } catch (error) {
            console.log("Error leyendo config de Firebase");
        }
    };

    useEffect(() => {
        const verifyStrictProStatus = async () => {
            try {
                fetchFirebaseConfig();
                const livePacks = await getDynamicPackages();
                setDynamicPacks(livePacks);
                
                const offerings = await Purchases.getOfferings();
                const targetOffering = offerings.current || offerings.all['default'];
                if (targetOffering && targetOffering.availablePackages) {
                    setRealPackages(targetOffering.availablePackages);
                }
                
                const customerInfo = await Purchases.getCustomerInfo();
                const premiumEntitlement = customerInfo.entitlements.active['premium_access'];
                const isEntitlementActive = !!(premiumEntitlement && premiumEntitlement.isActive);

                const activeSubs = customerInfo.activeSubscriptions || [];
                const hasActiveSub = activeSubs.some(sub => 
                    sub.includes('alterego_pro_weekly') || 
                    sub.includes('alterego_pro_monthly') || 
                    sub.includes('alterego_pro_yearly')
                );

                const realProStatus = isEntitlementActive && hasActiveSub;

                setIsPro(realProStatus);
                
                if (realProStatus) {
                    CreditManager.activatePro();
                    syncProStatusToFirebase(true);
                } else {
                    CreditManager.deactivatePro();
                    syncProStatusToFirebase(false);
                }

            } catch (e) {
                console.log("Error validación estricta:", e);
            }
        };

        if (visible) {
            verifyStrictProStatus();
        }
    }, [visible]);

    useEffect(() => {
        if (!isPro && isAdLoaded) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.02, duration: 1500, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true })
                ])
            ).start();
        } else {
            pulseAnim.stopAnimation();
            pulseAnim.setValue(1);
        }
    }, [isAdLoaded, isPro]);

    useEffect(() => {
        if (visible && !isPro) {
            const unsubscribeLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => setIsAdLoaded(true));
            const unsubscribeEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, reward => {
                const current = CreditManager.getCredits();
                CreditManager.setCredits(current + 90); 
                Alert.alert("¡Energía Recargada! ⚡", "Has ganado 1.5 Créditos.");
                setTimeout(() => { onClose(); }, 500);
            });
            const unsubscribeClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
                setIsAdLoaded(false);
                rewarded.load();
            });
            const unsubscribeError = rewarded.addAdEventListener(AdEventType.ERROR, () => setIsAdLoaded(false));

            if (!isAdLoaded) rewarded.load();

            return () => {
                unsubscribeLoaded(); unsubscribeEarned(); unsubscribeClosed(); unsubscribeError();
            };
        }
    }, [visible, isPro]);

    const handleShowAd = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (isAdLoaded && rewarded.loaded) {
            try {
                setIsAdLoaded(false); 
                rewarded.show();
            } catch (error) {
                Alert.alert("Aviso", "El anuncio expiró o hubo un problema al cargarlo. Estamos buscando uno nuevo.");
                rewarded.load();
            }
        } else {
            Alert.alert("Cargando...", "El video se está preparando. Intenta en un momento.");
        }
    };

    // 🔥 SOLUCIÓN AL ERROR LÉXICO: Funciones de búsqueda globales al componente 🔥
    const getPackageData = (id) => {
        if (realPackages && realPackages.length > 0) {
            return realPackages.find(p => p.identifier === id || (p.product && p.product.identifier.includes(id)));
        }
        return null;
    };

    const getOfferText = (pkg) => {
        if (pkg && pkg.product && pkg.product.introPrice) {
            const intro = pkg.product.introPrice;
            if (intro.price === 0) return "🎁 ¡Prueba Gratis Disponible!";
            return `🔥 Oferta inicial: ${intro.priceString}`;
        }
        return null;
    };

    // 🔥 GENERADOR DINÁMICO DE SUSCRIPCIONES (Oculta las que no existen) 🔥
    const getActiveSubscriptions = () => {
        const weeklyPkg = getPackageData('alterego_pro_weekly');
        const monthlyPkg = getPackageData('alterego_pro_monthly');
        const yearlyPkg = getPackageData('alterego_pro_yearly');

        const activeSubs = [];

        // Si RevenueCat dice que el paquete semanal existe, lo agregamos
        if (weeklyPkg) {
            activeSubs.push({ 
                id: 'alterego_pro_weekly',
                name: t?.sub_weekly || 'Pase Semanal PRO', 
                desc: `Traducción ilimitada.\n100% Sin anuncios.${bonuses.weekly.active && bonuses.weekly.amount > 0 ? `\n+${bonuses.weekly.amount} Créditos de regalo.` : ''}`, 
                price: weeklyPkg.product.priceString,
                period: '/sem',
                icon: 'star', 
                color: '#FF6B6B',
                glow: 'rgba(255, 107, 107, 0.15)',
                bonusInfo: bonuses.weekly,
                offer: getOfferText(weeklyPkg)
            });
        }

        // Si RevenueCat dice que el paquete mensual existe, lo agregamos
        if (monthlyPkg) {
            activeSubs.push({ 
                id: 'alterego_pro_monthly',
                name: t?.sub_monthly || 'Pase Mensual PRO', 
                desc: `Traducción ilimitada.\n100% Sin anuncios.${bonuses.monthly.active && bonuses.monthly.amount > 0 ? `\n+${bonuses.monthly.amount} Créditos de regalo.` : ''}`, 
                price: monthlyPkg.product.priceString,
                period: '/mes',
                icon: 'crown', 
                color: '#FFD700',
                glow: 'rgba(255, 215, 0, 0.15)',
                bonusInfo: bonuses.monthly,
                offer: getOfferText(monthlyPkg)
            });
        }

        // Si RevenueCat dice que el paquete anual existe, lo agregamos
        if (yearlyPkg) {
            activeSubs.push({ 
                id: 'alterego_pro_yearly', 
                name: t?.sub_yearly || 'Pase Anual PRO', 
                desc: `Traducción ilimitada.\n100% Sin anuncios.${bonuses.yearly.active && bonuses.yearly.amount > 0 ? `\n+${bonuses.yearly.amount} Créditos de regalo.` : ''}`, 
                price: yearlyPkg.product.priceString,
                period: '/año',
                icon: 'gem', 
                color: '#00E5FF',
                badge: t?.best_value || 'MEJOR VALOR',
                glow: 'rgba(0, 229, 255, 0.15)',
                bonusInfo: bonuses.yearly,
                offer: getOfferText(yearlyPkg)
            });
        }

        return activeSubs;
    };

    const handlePurchase = async (pkg, isSubscription = false) => {
        try {
            const offerings = await Purchases.getOfferings();
            const targetOffering = offerings.current || offerings.all['default'];

            if (targetOffering && targetOffering.availablePackages) {
                const packageToBuy = targetOffering.availablePackages.find(x => 
                    x.identifier === pkg.id || (x.product && x.product.identifier.includes(pkg.id))
                );
                
                if (packageToBuy) {
                    const { customerInfo } = await Purchases.purchasePackage(packageToBuy);
                    
                    if (isSubscription) {
                        if (typeof customerInfo.entitlements.active['premium_access'] !== "undefined") {
                            
                            let bonusGiven = 0;
                            if (pkg.bonusInfo && pkg.bonusInfo.active && pkg.bonusInfo.amount > 0) {
                                const rcUserId = await Purchases.getAppUserID();
                                if (rcUserId) {
                                    try {
                                        const response = await fetch(`${FIREBASE_URL}/users/${rcUserId}/credits.json`);
                                        const currentCloudCredits = await response.json();
                                        const realCurrent = currentCloudCredits ? parseFloat(currentCloudCredits) : 0;
                                        
                                        const bonusUnits = pkg.bonusInfo.amount * 60; 
                                        const newBalance = realCurrent + bonusUnits;

                                        await fetch(`${FIREBASE_URL}/users/${rcUserId}/credits.json`, {
                                            method: 'PUT',
                                            body: JSON.stringify(newBalance)
                                        });
                                        CreditManager.setCredits(newBalance);
                                        bonusGiven = pkg.bonusInfo.amount;
                                    } catch (e) {
                                        console.log("Error sumando bono:", e);
                                    }
                                }
                            }

                            CreditManager.activatePro(); 
                            syncProStatusToFirebase(true); 
                            setIsPro(true); 
                            onClose();
                            setTimeout(() => { 
                                const bonusMsg = bonusGiven > 0 ? ` Además te regalamos +${bonusGiven} Créditos para usar en Live.` : '';
                                Alert.alert("¡Bienvenido al VIP!", `Has desbloqueado traducciones ilimitadas y sin anuncios.${bonusMsg}`);
                                if(onPurchaseSuccess) onPurchaseSuccess('PRO'); 
                            }, 500);
                        }
                    } else {
                        const rcUserId = await Purchases.getAppUserID();
                        if (rcUserId) {
                            try {
                                const response = await fetch(`${FIREBASE_URL}/users/${rcUserId}/credits.json`);
                                const currentCloudCredits = await response.json();
                                const realCurrent = currentCloudCredits ? parseFloat(currentCloudCredits) : 0;
                                
                                const unitsToAdd = pkg.credits * 60;
                                const newBalance = realCurrent + unitsToAdd;

                                await fetch(`${FIREBASE_URL}/users/${rcUserId}/credits.json`, {
                                    method: 'PUT',
                                    body: JSON.stringify(newBalance)
                                });
                                CreditManager.setCredits(newBalance);
                            } catch (e) {
                                console.log("Error sumando créditos:", e);
                            }
                        }
                        onClose();
                        setTimeout(() => { if(onPurchaseSuccess) onPurchaseSuccess(pkg.credits); }, 500);
                    }
                } else {
                    Alert.alert("Aviso", "Este paquete no está disponible en tu región.");
                }
            }
        } catch (e) {
            if (!e.userCancelled && onPurchaseError) onPurchaseError();
        }
    };

    const handleRestorePurchases = async () => {
        setIsRestoring(true);
        try {
            const customerInfo = await Purchases.restorePurchases();
            const premiumEntitlement = customerInfo.entitlements.active['premium_access'];
            const isEntitlementActive = !!(premiumEntitlement && premiumEntitlement.isActive);

            const activeSubs = customerInfo.activeSubscriptions || [];
            const hasActiveSub = activeSubs.some(sub => 
                sub.includes('alterego_pro_weekly') || 
                sub.includes('alterego_pro_monthly') || 
                sub.includes('alterego_pro_yearly')
            );

            if (isEntitlementActive && hasActiveSub) {
                CreditManager.activatePro();
                syncProStatusToFirebase(true); 
                setIsPro(true); 
                Alert.alert("¡Restaurado!", "Tu pase PRO ha sido reactivado con éxito.");
                onClose();
            } else {
                CreditManager.deactivatePro();
                syncProStatusToFirebase(false); 
                setIsPro(false); 
                Alert.alert("Sin compras", "No encontramos ninguna suscripción VIP activa vinculada a esta cuenta.");
            }
        } catch (e) {
            Alert.alert("Error", "No pudimos conectar con la tienda. Intenta más tarde.");
        } finally {
            setIsRestoring(false);
        }
    };

    // 🔥 FILTRO PARA PAQUETES DINÁMICOS DE CRÉDITOS 🔥
    // Solo muestra los paquetes de créditos que RevenueCat confirma que existen
    const activeDynamicPacks = dynamicPacks.filter(item => getPackageData(item.id) !== null);

    return (
        <Modal visible={visible} animationType="slide" transparent={false} presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={[styles.ambientAuraTop, { opacity: isDarkMode ? 0.07 : 0.03 }]} />
                <View style={[styles.ambientAuraBottom, { opacity: isDarkMode ? 0.04 : 0.02 }]} />
                
                <TouchableOpacity onPress={onClose} style={[styles.closeFloatBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                    
                    {isPro ? (
                        <View style={[styles.headerProCard, { backgroundColor: theme.surface }]}>
                            <LinearGradient colors={['rgba(255, 215, 0, 0.15)', 'rgba(255, 215, 0, 0.02)']} style={StyleSheet.absoluteFillObject} />
                            <FontAwesome5 name="crown" size={42} color="#FFD700" style={{marginBottom: 15}} />
                            <Text style={[styles.titleVip, { color: theme.text }]}>ESTADO VIP ACTIVO</Text>
                            <Text style={[styles.descVip, { color: theme.textSecondary }]}>Disfrutas del traductor ilimitado y sin anuncios.</Text>
                        </View>
                    ) : (
                        <View style={[styles.dashboardCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            <View style={styles.dashboardHeader}>
                                <FontAwesome5 name="robot" size={16} color={theme.primary} />
                                <View style={[styles.dashboardBadge, { backgroundColor: theme.iconBg }]}><Text style={styles.dashboardBadgeText}>PLAN BÁSICO</Text></View>
                            </View>
                            <Text style={[styles.dashboardTitle, { color: theme.text }]}>Tu Plan Actual</Text>
                            <View style={styles.featuresList}>
                                <View style={styles.featureItem}>
                                    <Ionicons name="checkmark-circle" size={16} color={theme.primary} /><Text style={[styles.featureText, { color: theme.textSecondary }]}>Traductor estándar limitado con anuncios.</Text>
                                </View>
                            </View>
                        </View>
                    )}
                    
                    {!isPro && (
                        <>
                            <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>ACTUALIZAR A PRO 🚀</Text></View>
                            
                            {/* 🔥 RENDERIZAMOS SOLO LAS SUSCRIPCIONES ACTIVAS EN GOOGLE PLAY 🔥 */}
                            {getActiveSubscriptions().map((sub) => (
                                <TouchableOpacity key={sub.id} activeOpacity={0.85} onPress={() => handlePurchase(sub, true)} style={styles.cardWrapper}>
                                    <LinearGradient colors={[sub.color, 'rgba(0,0,0,0.05)']} style={styles.gradientBorder}>
                                        <View style={[styles.premiumCard, { backgroundColor: theme.surface }]}>
                                            <View style={styles.premiumCardInner}>
                                                <FontAwesome5 name={sub.icon} size={22} color={sub.color}/>
                                                <View style={styles.premiumTextContent}>
                                                    <Text style={[styles.premiumTitle, { color: theme.text }]}>{sub.name}</Text>
                                                    <Text style={[styles.premiumDesc, { color: theme.textSecondary }]}>{sub.desc}</Text>
                                                    {sub.offer && (
                                                        <Text style={[styles.offerText, { color: sub.color }]}>{sub.offer}</Text>
                                                    )}
                                                </View>
                                                <View style={styles.priceTag}>
                                                    <Text style={[styles.priceTagValue, { color: theme.text }]}>{sub.price}</Text>
                                                    <Text style={[styles.priceTagPeriod, { color: theme.textSecondary }]}>{sub.period}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </LinearGradient>
                                </TouchableOpacity>
                            ))}

                            <View style={styles.dividerContainer}>
                                <View style={styles.dividerLine} /><Text style={styles.dividerText}>ENERGÍA PARA INMERSIÓN</Text><View style={styles.dividerLine} />
                            </View>

                            <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 20 }}>
                                <TouchableOpacity activeOpacity={0.8} onPress={handleShowAd}>
                                    <LinearGradient colors={['#8A2387', '#E94057', '#F27121']} style={styles.rewardedCard}>
                                        <Ionicons name="play" size={22} color="#FFF" />
                                        <View style={styles.rewardedContent}>
                                            <Text style={styles.rewardedTitle}>Ganar 1.5 Créditos</Text>
                                            <Text style={styles.rewardedDesc}>Mira un anuncio corto y obtén energía gratis.</Text>
                                        </View>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </Animated.View>
                        </>
                    )}

                    {/* 🔥 RENDERIZAMOS SOLO LOS PAQUETES DE CRÉDITOS ACTIVOS EN GOOGLE PLAY 🔥 */}
                    {activeDynamicPacks.map((item) => {
                        const pkgData = getPackageData(item.id);
                        const displayPrice = pkgData ? pkgData.product.priceString : item.price;

                        return (
                            <TouchableOpacity key={item.id} activeOpacity={0.8} style={styles.cardWrapper} onPress={() => handlePurchase(item, false)}>
                                <View style={[styles.creditCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <MaterialCommunityIcons name="lightning-bolt" size={26} color={item.color}/>
                                    <View style={styles.premiumTextContent}>
                                        <Text style={[styles.premiumTitle, { color: theme.text }]}>{t?.packs?.[item.nameKey] || item.nameKey}</Text>
                                        <Text style={[styles.premiumDesc, { color: theme.textSecondary }]}>{item.credits} Créditos.</Text>
                                    </View>
                                    <Text style={[styles.priceTagValue, { color: item.color, fontSize: 18 }]}>{displayPrice}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}

                    {!isPro && (
                        <TouchableOpacity onPress={handleRestorePurchases} style={styles.restoreBtn} disabled={isRestoring}>
                            {isRestoring ? <ActivityIndicator size="small" color={theme.primary} /> : <Text style={styles.restoreText}>Restaurar compras anteriores</Text>}
                        </TouchableOpacity>
                    )}
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    ambientAuraTop: { position: 'absolute', top: -100, left: -50, width: 350, height: 350, borderRadius: 175, backgroundColor: '#00E5FF', opacity: 0.05 },
    ambientAuraBottom: { position: 'absolute', bottom: -100, right: -50, width: 300, height: 300, borderRadius: 150, backgroundColor: '#FFD700', opacity: 0.05 },
    closeFloatBtn: { position: 'absolute', top: 30, right: 20, zIndex: 100, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    scrollContent: { padding: 20, paddingTop: 80, paddingBottom: 50 },
    headerProCard: { alignItems: 'center', padding: 30, borderRadius: 28, marginBottom: 35, borderWidth: 1, borderColor: '#FFD700' },
    titleVip: { fontSize: 22, fontWeight: '900', marginBottom: 10 },
    descVip: { textAlign: 'center', fontSize: 14 },
    dashboardCard: { padding: 25, borderRadius: 28, marginBottom: 35, borderWidth: 1 },
    dashboardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    dashboardBadge: { padding: 5, borderRadius: 10 },
    dashboardBadgeText: { fontSize: 10, fontWeight: '800' },
    dashboardTitle: { fontSize: 24, fontWeight: '900', marginBottom: 20 },
    featuresList: { padding: 10 },
    featureItem: { flexDirection: 'row', marginBottom: 10 },
    featureText: { marginLeft: 10, fontSize: 13 },
    sectionHeader: { marginBottom: 15 },
    sectionHeaderText: { fontSize: 11, fontWeight: '900', color: '#888' },
    cardWrapper: { marginBottom: 16 },
    gradientBorder: { borderRadius: 26, padding: 1.5 },
    premiumCard: { borderRadius: 24 },
    premiumCardInner: { flexDirection: 'row', alignItems: 'center', padding: 20 },
    premiumTextContent: { flex: 1, marginLeft: 15 },
    premiumTitle: { fontWeight: '900', fontSize: 17 },
    premiumDesc: { fontSize: 12 },
    offerText: { fontSize: 11, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 }, 
    priceTag: { alignItems: 'flex-end' },
    priceTagValue: { fontSize: 20, fontWeight: '900' },
    priceTagPeriod: { fontSize: 11 },
    dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 30 },
    dividerLine: { flex: 1, height: 1, backgroundColor: '#333' },
    dividerText: { marginHorizontal: 15, fontSize: 10, fontWeight: '900', color: '#888' },
    rewardedCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 26 },
    rewardedContent: { marginLeft: 15 },
    rewardedTitle: { color: '#FFF', fontSize: 18, fontWeight: '900' },
    rewardedDesc: { color: '#FFF', fontSize: 12 },
    creditCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 26, borderWidth: 1 },
    restoreBtn: { marginTop: 20, alignItems: 'center' },
    restoreText: { fontSize: 13, textDecorationLine: 'underline', color: '#888' }
});


Dime realmente este ws lo que si funciona?