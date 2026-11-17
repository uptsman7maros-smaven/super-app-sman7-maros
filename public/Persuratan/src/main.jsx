import React from 'react'
import { createRoot } from 'react-dom/client'
import LettersApp from './pages/LettersApp'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode><LettersApp /></React.StrictMode>
)
