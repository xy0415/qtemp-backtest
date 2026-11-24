/* Procedural chrome and liquid scene; WebGL with static fallback. */
(() => {
  'use strict';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  function mount() {
    const host = document.querySelector('.hero-left');
    if (!host || host.querySelector('.liquid-scene')) return;
    const wrap = document.createElement('div');
    wrap.className = 'liquid-scene';
    wrap.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    for (let i=0;i<4;i++) { const drop=document.createElement('i'); drop.className='chrome-drop chrome-drop-'+i; wrap.append(drop); }
    wrap.append(canvas);
    host.prepend(wrap);
    let gl;
    try { gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' }); } catch (_) {}
    if (!gl) return;
    const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const fs = `precision highp float;
    uniform vec2 resolution; uniform float clock;
    float sdSphere(vec3 p,float r){return length(p)-r;}
    float smoothMin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
    float shape(vec3 p){
      float t=clock*.28;
      p.y-=.32;
      float c=cos(t),s=sin(t);p.xz=mat2(c,-s,s,c)*p.xz;
      float d=sdSphere(p, .62);
      d=smoothMin(d,sdSphere(p-vec3(.54,.06,.01),.40),.25);
      d=smoothMin(d,sdSphere(p-vec3(-.48,.02,.02),.37),.22);
      d=smoothMin(d,sdSphere(p-vec3(.12,-.48,.10),.34),.2);
      d=smoothMin(d,sdSphere(p-vec3(-.13,.40,.02),.29),.2);
      d+=.025*sin(p.x*7.+t)*sin(p.y*8.-t)*sin(p.z*6.);
      return d;
    }
    vec3 norm(vec3 p){vec2 e=vec2(.002,0.);return normalize(vec3(shape(p+e.xyy)-shape(p-e.xyy),shape(p+e.yxy)-shape(p-e.yxy),shape(p+e.yyx)-shape(p-e.yyx)));}
    vec3 studio(vec3 d){
      float horizon=smoothstep(-.4,.6,d.y);vec3 col=mix(vec3(.015),vec3(.12),horizon);
      float soft=pow(max(dot(d,normalize(vec3(-.7,.8,1.))),0.),12.);
      float strip=pow(max(0.,1.-abs(d.x*.76+d.y*.35-.32)*5.),9.)*smoothstep(-.5,.6,d.y);
      float strip2=pow(max(0.,1.-abs(d.x*.67-d.y*.35+.53)*6.),8.);
      col+=vec3(soft*.8+strip*1.45+strip2*.75);
      return col;
    }
    void main(){
      vec2 uv=(gl_FragCoord.xy-.5*resolution)/resolution.y;
      vec3 ro=vec3(0.,.8,4.2), rd=normalize(vec3(uv.x,uv.y-.05,-1.7));
      vec3 col=vec3(.018)+vec3(.025)*max(0.,1.-length(uv)*.75);
      float dist=0.;bool hit=false;
      for(int i=0;i<64;i++){vec3 p=ro+rd*dist;float h=shape(p);if(h<.002){hit=true;break;}dist+=h*.8;if(dist>9.)break;}
      if(hit){vec3 p=ro+rd*dist;vec3 n=norm(p);vec3 refl=reflect(rd,n);col=studio(refl);float rim=pow(1.-max(dot(-rd,n),0.),3.);col+=rim*.16;col*=.91;}
      else if(rd.y<-.025){
        float t=(-.56-ro.y)/rd.y;vec3 p=ro+rd*t;
        if(t>0.&&t<30.){float w=sin(p.x*3.7+clock*.7)*cos(p.z*2.1-clock*.5)*.045+sin(p.z*4.1+clock*.5)*.025;
          vec3 n=normalize(vec3(.16*cos(p.x*3.7+clock*.7),1.,.10*cos(p.z*4.1+clock*.5)));
          vec3 rr=reflect(rd,n);float shine=pow(max(dot(rr,normalize(vec3(-.5,.8,1.))),0.),14.);
          float rings=pow(max(0.,sin(length(p.xz)*13.-clock*1.4)*.5+.5),8.);
          col=mix(vec3(.012),studio(rr)*.28+vec3(shine*.32+rings*.08+w*.14),(1.-smoothstep(1.,24.,t)));
          float reflection=exp(-dot(p.xz,p.xz)*.8)*.14;col+=reflection;}
      }
      col=pow(max(col,0.),vec3(.85));gl_FragColor=vec4(col,1.);
    }`;
    function shader(type, source) {const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){gl.deleteShader(sh);return null}return sh}
    const v=shader(gl.VERTEX_SHADER,vs),f=shader(gl.FRAGMENT_SHADER,fs);if(!v||!f)return;
    const program=gl.createProgram();gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return;
    gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const pos=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    const res=gl.getUniformLocation(program,'resolution'),time=gl.getUniformLocation(program,'clock');let frame=0, start=performance.now(), last=0;
    const resize=()=>{const d=Math.min(window.devicePixelRatio||1,1);const w=Math.max(1,Math.floor(canvas.clientWidth*d*.8)),h=Math.max(1,Math.floor(canvas.clientHeight*d*.8));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h)}};
    const render=now=>{if(!canvas.isConnected){cancelAnimationFrame(frame);gl.deleteBuffer(buffer);gl.deleteProgram(program);return}if(!document.hidden&&(motion.matches||now-last>=40)){resize();gl.uniform2f(res,canvas.width,canvas.height);gl.uniform1f(time,(now-start)/1000);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);last=now;}if(!motion.matches)frame=requestAnimationFrame(render)};
    render(performance.now());
  }
  const content=document.getElementById('content');if(!content)return;
  new MutationObserver(mount).observe(content,{childList:true});mount();
})();
