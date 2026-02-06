import Constants from 'expo-constants'

type ExpoExtra = {
  apiBaseUrl?: string
  googleAndroidClientId?: string
  googleWebClientId?: string
}

const extra = (Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {}) as ExpoExtra

export const API_BASE_URL = extra.apiBaseUrl ?? 'https://app.privetsuper.ru:18000/api/v1'
export const GOOGLE_ANDROID_CLIENT_ID = extra.googleAndroidClientId ?? ''
export const GOOGLE_WEB_CLIENT_ID = extra.googleWebClientId ?? ''
