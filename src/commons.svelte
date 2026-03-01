<script>
  // 汎用関数および、ストア変数（グローバル変数に近い）
  
  // export const media = $state({
  //   fileURL:'',
  //   imageURL:'',
  //   isAudio:true,
  //   isPlaying:false,
  //   duration:0,
  //   playbackRate:1,
  //   volume:0.5,
  // });
  
  // export const json_data = $state({
  //     seekTime: 0,
  //     audioFile: '',
  //     imageSRT: '',
  //     srtFiles: {
  //         default: {
  //             filePath: '',
  //             default_class: 'default1',
  //             x: 100,
  //             y: 100,
  //             max_width: 500,
  //             max_height: 500,
  //             boxAlignX: 0,
  //             boxAlignY: 0,
  //             isVertical: false,
  //             textAlignSelect: 1,
  //             verticalAlignSelect: 1
  //         }
  //     },
  //     styles:{
  //         default1:{
  //             font: "りいポップ角",
  //             fontSize: 30,
  //             textColor: "rgba(0, 0, 0,1)",
  //             letter_space: 0,
  //             line_space: 10,
  //             isBold: false,
  //             isItalic: false,
  //             outline1: {
  //               enable: true,
  //               offsetX:0,
  //               offsetY:0,
  //               size: 7,
  //               color: "rgba(255, 255, 255, 0.95)"
  //             },
  //             outline2: {
  //               enable: true,
  //               offsetX:0,
  //               offsetY:0,
  //               size: 5,
  //               color: "rgba(32, 32, 32, 0.8)"
  //             },
  //             shadow: {
  //               enable: true,
  //               steps:8,
  //               offsetX:0,
  //               offsetY:0,
  //               size: 10,
  //               color: "rgba(170, 0, 119, 0.1)",
  //               blur: 16,
  //             }
  //         }
  //     }
  // });
  
  // const styles =$derived.by(() => {
  //   const styleMap = {};
  
  //   const styleEntries = Object.entries(json_data.styles || {});
    
  //   for (const [className, style] of styleEntries) {
      
  //     const directions = (style.shadow.enable && style.shadow.steps) 
  //       ? createShadowDirections(style.shadow.steps)
  //       : [];
  
  //     // drop-shadow の文字列を組み立て
  //     const shadowFilter = directions.map(([dx, dy]) => {
  //       const x = dx * style.shadow.size + (style.shadow.offsetX || 0);
  //       const y = dy * style.shadow.size + (style.shadow.offsetY || 0);
  //       const rgba = hexToRgba(style.shadow.color, style.shadow.opacity || 1);
  //       return `drop-shadow(${x}px ${y}px ${style.shadow.blur}px ${rgba})`;
  //     }).join(' ');
  
  //     const outline2_size = style.outline1.enable ? style.outline1.size + style.outline2.size : style.outline2.size;
  
  //     styleMap[className] = Object.entries({
  //       '--txt_rotate': style.isVertical ? 'vertical-rl' : 'horizontal-tb',
  //       '--txt_font': `'${style.font}'`,
  //       '--txt_size': `${style.fontSize}px`,
  //       '--txt_color': style.textColor,
  //       '--txt_style': style.isItalic ? 'italic' : 'normal',
  //       '--txt_weight': style.isBold ? 'bold' : 'normal',
  //       '--txt_space': `${style.letter_space}px`,
  //       '--txt_line_space': `${style.line_space}px`,
  //       '--out1_color': style.outline1.color,
  //       '--out1_size': `${style.outline1.size}px`,
  //       '--out2_color': style.outline2.color,
  //       '--out2_size': `${outline2_size || 0}px`,
  //       '--shadow_filter': shadowFilter,
  //     })
  //       .map(([key, val]) => `${key}: ${val}`)
  //       .join('; ');
  //   }
  
  //   return styleMap;
  // });
  
  // // steps数で分割した角度の(dx,dy)座標の配列を返す関数
  // // ※ steps = 8 の場合は、8方向分の角度の配列を返す。
  // const createShadowDirections = (steps, offset = 0) => {
  //   const angleStep = (2 * Math.PI) / steps;
  //   return Array.from({ length: steps }, (_, i) => {
  //     const angle = i * angleStep + offset;
  //     return [Math.cos(angle), Math.sin(angle)];
  //   });
  // };
  
  // // 色を#ff0000のようなhex値から、rgba(255, 0, 0, 0.57)のように変換する関数
  // const hexToRgba = (hex, opacity = 1) => {
  //   const bigint = parseInt(hex.replace('#', ''), 16);
  //   const r = (bigint >> 16) & 255;
  //   const g = (bigint >> 8) & 255;
  //   const b = bigint & 255;
  //   return `rgba(${r},${g},${b},${opacity})`;
  // };


</script>



<main>
  
</main>



<style>

</style>
  

