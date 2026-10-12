export function settingsReducer(state, action) {
  switch (action.type) {
    case 'SET_LANG':
      localStorage.setItem('zk_lang', action.payload)
      localStorage.setItem('zk_lang_chosen', '1')
      return { ...state, lang: action.payload }

    case 'SET_SETTINGS': {
      const next = { ...state.settings, ...action.payload }
      localStorage.setItem('zk_settings', JSON.stringify(next))
      return { ...state, settings: next }
    }

    default:
      return state
  }
}
