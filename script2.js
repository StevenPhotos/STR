const BUFFER_SIZE = 8192;

class AudioPlayer {
  constructor({emitter, pitch, tempo, reverbImpulseResponse}) {
      this.emitter = emitter;

      this.context = new AudioContext();
      this.scriptProcessor = this.context.createScriptProcessor(BUFFER_SIZE, 2, 2);
      this.scriptProcessor.onaudioprocess = e => {
          const l = e.outputBuffer.getChannelData(0);
          const r = e.outputBuffer.getChannelData(1);
          const framesExtracted = this.simpleFilter.extract(this.samples, BUFFER_SIZE);
          if (framesExtracted === 0) {
              this.emitter.emit('stop');
          }
          for (let i = 0; i < framesExtracted; i++) {
              l[i] = this.samples[i * 2];
              r[i] = this.samples[i * 2 + 1];
          }
      };

     
      this.soundTouch = new SoundTouch();
      this.soundTouch.pitch = pitch;
      this.soundTouch.tempo = tempo;
      
      this.duration = undefined;

        
      this.volumeNode = this.context.createGain();
      this.volumeNode.gain.value = 0.5;
    
      this.convolverNode = this.context.createConvolver();
      this.convolverNode.buffer = reverbImpulseResponse;

      this.dryWetGainNode = this.context.createGain();
      this.dryWetGainNode.gain.value = 0.6;
  }


  setImpulseResponse(buffer) {
    if (this.convolverNode) {
        this.convolverNode.buffer = buffer;
    }
}

  get pitch() {
      return this.soundTouch.pitch;
  }
  set pitch(pitch) {
      this.soundTouch.pitch = pitch;
  }

  get tempo() {
      return this.soundTouch.tempo;
  }
  set tempo(tempo) {
      this.soundTouch.tempo = tempo;
  }

  set dwGainNode(dwgnValue){
    this.dryWetGainNode.gain.value = dwgnValue;
  }

  decodeAudioData(data) {
      return this.context.decodeAudioData(data);
  }

  setBuffer(buffer) {
      const bufferSource = this.context.createBufferSource();
      bufferSource.buffer = buffer;

      this.samples = new Float32Array(BUFFER_SIZE * 2);
      this.source = {
          extract: (target, numFrames, position) => {
              this.emitter.emit('state', {t: position / this.context.sampleRate});
              const l = buffer.getChannelData(0);
              const r = buffer.getChannelData(1);
              for (let i = 0; i < numFrames; i++) {
                  target[i * 2] = l[i + position];
                  target[i * 2 + 1] = r[i + position];
              }
              return Math.min(numFrames, l.length - position);
          },
      };
      this.simpleFilter = new SimpleFilter(this.source, this.soundTouch);

      this.duration = buffer.duration;
      this.emitter.emit('state', {duration: buffer.duration});
  }


  play() {
        
      this.scriptProcessor.connect(this.volumeNode);
      this.volumeNode.connect(this.context.destination)

      this.context.resume().then(() => {
              this.scriptProcessor.connect(this.convolverNode);

              this.convolverNode.connect(this.dryWetGainNode);
              this.dryWetGainNode.connect(this.context.destination);
          });
}

pause() {
    this.scriptProcessor.disconnect(this.volumeNode);
    this.volumeNode.disconnect(this.context.destination);
    this.scriptProcessor.disconnect(this.convolverNode);
    this.convolverNode.disconnect(this.dryWetGainNode);
    this.dryWetGainNode.disconnect(this.context.destination);
}

toggle(statement){
    if(statement == true){
        this.scriptProcessor.disconnect(this.volumeNode);
        this.volumeNode.disconnect(this.context.destination);
        this.convolverNode.connect(this.dryWetGainNode);
        this.dryWetGainNode.connect(this.context.destination);
    }
    else{
      this.scriptProcessor.connect(this.volumeNode);
      this.volumeNode.connect(this.context.destination)
    }
}

get durationVal(){
    return this.simpleFilter.sourcePosition;
}

  seekPercent(percent) {
      if (this.simpleFilter !== undefined) {
          this.simpleFilter.sourcePosition = Math.round(
              percent / 100 * this.duration * this.context.sampleRate
          );
      }
  }
}

const fileInput = document.getElementById('fileInput');
const reverbInput = document.getElementById('reverbFileInput');
const reverbBTN = document.getElementById('reverbBTN');
const playButton = document.getElementById('playButton');
const pauseButton = document.getElementById('pauseButton');
const toggleRevButton = document.getElementById('toggleRevButton');
const tempoSlider = document.getElementById('tempoSlider');
const pitchSlider = document.getElementById('pitchSlider');
const reverbSlider = document.getElementById('reverbSlider');
const revDurSlider = document.getElementById('revDurSlider');
const revDecSlider = document.getElementById('revDecSlider');
const bufferChannels = document.querySelectorAll('.bufferChan');
const seekSlider = document.getElementById('seekSlider');
const currentTimeDisplay = document.getElementById('currentTime');


let myInterval;

let isPlaying = false;

let toggleRev = false;

let audioPlayer;

let bufferOr;
let audioData;


fileInput.addEventListener('change', async (e, impulse) => {
    // If there's a song selected we pause it and undefine
    // audio player so we can create a new one for new song
    if(audioPlayer){
        if(isPlaying){
            audioPlayer.pause();
            isPlaying = false;
            audioPlayer = undefined;
        }
        else if(!isPlaying){
            audioPlayer = undefined;
        }
    };

    const file = e.target.files[0];
    if (!file) return;
    
    // Initialize the AudioPlayer
    audioPlayer = new AudioPlayer({
        emitter: {
            emit: () => {},
        },
        pitch: pitchSlider.value,
        tempo: tempoSlider.value
    });

    try {
        const response = await fetch(URL.createObjectURL(file));
        bufferOr = await response.arrayBuffer();
        audioData = await audioPlayer.decodeAudioData(bufferOr);
        audioPlayer.setBuffer(audioData);

        audioPlayer.play();
        isPlaying = true;
        
        myInterval = setInterval(()=>{
            updateSeek(audioPlayer, seekSlider);
        }, 1000);

    } catch (error) {
        console.error(error);
    }

});

reverbInput.addEventListener('change', async (e) =>{
    const file = e.target.files[0];
    const objectURL = URL.createObjectURL(file);
    reverbSlider.value = 0.5;
    reverbSlider.max = 2;
    fetch(objectURL)
            .then((response) => response.arrayBuffer())
            .then((data) => audioPlayer.context.decodeAudioData(data))
            .then((buffer) => {
                impulseResponseBuffer = buffer;
                audioPlayer.setImpulseResponse(buffer); // Add a method to set the impulse response
                audioPlayer.dryWetGainNode.gain.value = 0.5;
            })
            .catch((error) => console.error('Error loading impulse response:', error));
})

reverbBTN.addEventListener('click', ()=>{
    let impulse = impulseResponse(revDurSlider.value, revDecSlider.value);
    audioPlayer.setImpulseResponse(impulse);
    reverbSlider.max = 6;

    bufferOr = response.arrayBuffer();
    audioData = audioPlayer.decodeAudioData(bufferOr);
    audioPlayer.setBuffer(audioData);
    
});

revDurSlider.addEventListener('pointerup', ()=>{
    console.log("change");
    reverbSlider.max = 6;
    let impulse = impulseResponse(revDurSlider.value, revDecSlider.value);
    audioPlayer.setImpulseResponse(impulse);

    bufferOr = response.arrayBuffer();
    audioData = audioPlayer.decodeAudioData(bufferOr);
    audioPlayer.setBuffer(audioData);
});

revDecSlider.addEventListener('pointerup', ()=>{
    console.log("change");
    reverbSlider.max = 6;
    let impulse = impulseResponse(revDurSlider.value, revDecSlider.value);
    audioPlayer.setImpulseResponse(impulse);

    bufferOr = response.arrayBuffer();
    audioData = audioPlayer.decodeAudioData(bufferOr);
    audioPlayer.setBuffer(audioData);
});


function impulseResponse(duration, decay, bChannels = bufferChannels) {

    let chanAmount = returnBChannel(bChannels);

    let context = new AudioContext();
    let length = context.sampleRate * duration;
    let impulse = context.createBuffer(chanAmount, length, context.sampleRate); // first value is whether it's mono, stereo or 4-channel so either 1, 2, or 4

    if(chanAmount == 1){
        let myImpulse = impulse.getChannelData(0);
        for (let i = 0; i < length; i++) {
          myImpulse[i] = (2 * Math.random() - 1) * Math.pow(1 - i / length, decay);
        }
    }
    else if(chanAmount == 2){
        let leftChannel = impulse.getChannelData(0);
        let rightChannel = impulse.getChannelData(1);
        for(let i = 0; i < length; i++){
            let value = (2 * Math.random() - 1) * Math.pow(1 - i / length, decay);
            leftChannel[i] = value;
            rightChannel[i] = value;
        }
    }
    else if(chanAmount == 4){
        for(let channel = 0; channel < 4; channel++){
            let channelData = impulse.getChannelData(channel);
            for(let i = 0; i < length; i++){
                channelData[i] = (2 * Math.random() - 1) * Math.pow(1 - i / length, decay);
            }
        }
    }


    return impulse;
  }

function returnBChannel(bufferChannels){
    let selectedVal = undefined;
    bufferChannels.forEach(radInp =>{

        if(radInp.checked == true){
            selectedVal = radInp.value;

        }
    })
    return selectedVal;
}

function updateSeek(audioPlayer, seekSlider) {
    if(audioPlayer){
        console.log("seeking");
        let sourcePostion = audioPlayer.durationVal;
        seekSlider.value = sourcePostion / 48000 / audioPlayer.duration;
    }
}

playButton.addEventListener('click', () => {
    if (!audioPlayer) return;
    if(!isPlaying){
        audioPlayer.play();
        isPlaying = true;
        myInterval = setInterval(()=>{
            updateSeek(audioPlayer, seekSlider);
        }, 1000);
    }

    bufferOr = response.arrayBuffer();
    audioData = audioPlayer.decodeAudioData(bufferOr);
    audioPlayer.setBuffer(audioData);
});

pauseButton.addEventListener('click', () => {
    if (!audioPlayer) return;
    if(isPlaying){
        audioPlayer.pause();
        isPlaying = false;
        clearInterval(myInterval);
    }
});

toggleRevButton.addEventListener('click', () =>{
    console.log(audioPlayer.durationVal);
    if (!audioPlayer) return;
    if(toggleRev == false){
        audioPlayer.toggle(false);
        toggleRev = true;
    }
    else{
        audioPlayer.toggle(true);
        toggleRev = false;
    }

    bufferOr = response.arrayBuffer();
    audioData = audioPlayer.decodeAudioData(bufferOr);
    audioPlayer.setBuffer(audioData);
})

tempoSlider.addEventListener('input', () => {
    if (audioPlayer) {
        audioPlayer.tempo = tempoSlider.value;
    }

    bufferOr = response.arrayBuffer();
    audioData = audioPlayer.decodeAudioData(bufferOr);
    audioPlayer.setBuffer(audioData);
});

pitchSlider.addEventListener('input', () => {
    if (audioPlayer) {
        audioPlayer.pitch = pitchSlider.value;
    }

    bufferOr = response.arrayBuffer();
    audioData = audioPlayer.decodeAudioData(bufferOr);
    audioPlayer.setBuffer(audioData);
});

reverbSlider.addEventListener('input', () =>{
    if(audioPlayer){
        audioPlayer.dwGainNode = reverbSlider.value;
    }

    bufferOr = response.arrayBuffer();
    audioData = audioPlayer.decodeAudioData(bufferOr);
    audioPlayer.setBuffer(audioData);
})

bufferChannels.forEach(radInp =>{
    radInp.addEventListener('click', ()=>{
        let impulse = impulseResponse(revDurSlider.value, revDecSlider.value);
        audioPlayer.setImpulseResponse(impulse);
    })
})

seekSlider.addEventListener('input', ()=>{
    let percentage = seekSlider.value * 100;
    if(audioPlayer){
        audioPlayer.seekPercent(percentage);
    }

    bufferOr = response.arrayBuffer();
    audioData = audioPlayer.decodeAudioData(bufferOr);
    audioPlayer.setBuffer(audioData);
})
