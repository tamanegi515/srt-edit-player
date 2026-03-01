<script>
    import svelteLogo from './assets/svelte.svg'
    import viteLogo from '/vite.svg'
    import Counter from './Counter.svelte'
    import MediaPlayer from './Media_Player.svelte';
    // import * as common from './commons'
    import { media } from '../commons.svelte'
    
    let fileHandle = $state(null);
    let fileURL = $state('');
    let fileType = $state('');
  
    // ファイル選択＆読み込み
    async function openFile() {
      try {
        // @ts-ignore
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: 'Media Files',
              accept: {
                'audio/*': ['.mp3'],
                'video/*': ['.mp4']
              }
            }
          ]
        });
  
        fileHandle = handle;
        const file = await handle.getFile();
        fileType = file.type;
  
        // ローカルURL生成
        fileURL = URL.createObjectURL(file);
      } catch (err) {
        console.error('ファイル選択がキャンセルされました', err);
      }
    }
  </script>
  
  
  
  <main>
    <div>
      <a href="https://vite.dev" target="_blank" rel="noreferrer">
        <img src={viteLogo} class="logo" alt="Vite Logo" />
      </a>
      <a href="https://svelte.dev" target="_blank" rel="noreferrer">
        <img src={svelteLogo} class="logo svelte" alt="Svelte Logo" />
      </a>
    </div>
    <h1>Vite + Svelte</h1>
  
  
    <h1>ローカルファイル再生プレイヤー</h1>
    <button onclick={openFile}>ファイルを選択（MP3 / MP4）</button>
    
    {#if $media.fileURL}
      <MediaPlayer />
    {/if}
  
    {#if fileURL && fileType.startsWith('audio/')}
      <audio class="player" controls src={fileURL}></audio>
    {:else if fileURL && fileType.startsWith('video/')}
      <video class="player" controls src={fileURL}></video>
    {/if}
  
  
    <div class="card">
      <Counter />
    </div>
  
    <p>
      Check out <a href="https://github.com/sveltejs/kit#readme" target="_blank" rel="noreferrer">SvelteKit</a>, the official Svelte app framework powered by Vite!
    </p>
  
    <div class="test" style="--color: #ff0000;">
      あ<span class="test" style="--color: #00ff00;">いいい</span>ううう
    </div>
  
    <p class="read-the-docs">
      Click on the Vite and Svelte logos to learn more
    </p>
  </main>
  
  
  
  <style>
    .logo {
      height: 6em;
      padding: 1.5em;
      will-change: filter;
      transition: filter 300ms;
    }
    .logo:hover {
      filter: drop-shadow(0 0 2em #646cffaa);
    }
    .logo.svelte:hover {
      filter: drop-shadow(0 0 2em #ff3e00aa);
    }
    .read-the-docs {
      color: #888;
    }
    
    .player {
      margin-top: 20px;
      max-width: 100%;
    }
  
    .test{
      color: var(--color,black);
    }
  </style>
  