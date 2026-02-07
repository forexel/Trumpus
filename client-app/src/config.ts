import Constants from 'expo-constants'
import appConfig from '../app.json'

type ExpoExtra = {
  apiBaseUrl?: string
  googleAndroidClientId?: string
  googleWebClientId?: string
}

const runtimeExtra = (Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {}) as ExpoExtra
const fileExtra = (appConfig?.expo?.extra ?? {}) as ExpoExtra
const extra = { ...fileExtra, ...runtimeExtra }

export const API_BASE_URL = extra.apiBaseUrl ?? 'https://app.privetsuper.ru:18000/api/v1'
export const GOOGLE_ANDROID_CLIENT_ID = extra.googleAndroidClientId ?? ''
export const GOOGLE_WEB_CLIENT_ID = extra.googleWebClientId ?? ''
