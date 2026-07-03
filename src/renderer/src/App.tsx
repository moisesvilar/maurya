import React from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SpikeAudioCapturePage } from '@/pages/SpikeAudioCapturePage'

function App(): React.ReactElement {
  return (
    <TooltipProvider>
      <SpikeAudioCapturePage />
      <Toaster />
    </TooltipProvider>
  )
}

export default App
