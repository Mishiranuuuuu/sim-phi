import { RpeTrack, RpeColorTrack, RpeTextTrack, RPETempo } from './utils/rpeBlock';
import { createControlTracks, type LineControlTracks } from './utils/rpeControl';
interface SpeedEventExtends extends SpeedEvent {
  floorPosition: number;
  floorPosition2: number;
  startSeconds: number;
  endSeconds: number;
}
interface NoteExtends extends Note {
  maxVisiblePos: number;
  offsetX: number;
  offsetY: number;
  alpha: number;
  baseAlpha: number;
  controlPos: number;
  controlSize: number;
  controlAlpha: number;
  controlSkew: number;
  seconds: number;
  holdSeconds: number;
  line: JudgeLine;
  lineId: number;
  noteId: number;
  isAbove: boolean;
  name: string;
  isMulti: boolean;
  nearNotes: NoteExtends[];
  badTime?: number;
  badY?: number;
  projectX: number;
  projectY: number;
  cosr: number;
  sinr: number;
  visible: boolean;
  showPoint: boolean;
  frameCount: number;
  status: number;
  scored: boolean;
  holdTapTime: number;
  holdStatus: number;
  holdBroken: boolean;
  statOffset: number;
}
interface LineEventExtends extends JudgeLineEvent {
  startSeconds: number;
  endSeconds: number;
}
interface JudgeLineExtends extends JudgeLine {
  lineId: number;
  offsetX: number;
  offsetY: number;
  alpha: number;
  rotation: number;
  positionY: number;
  positionY2: number;
  speedEvents: SpeedEventExtends[];
  notesAbove: NoteExtends[];
  notesBelow: NoteExtends[];
  judgeLineDisappearEvents: LineEventExtends[];
  judgeLineMoveEvents: LineEventExtends[];
  judgeLineRotateEvents: LineEventExtends[];
  disappearEventsIndex: number;
  moveEventsIndex: number;
  rotateEventsIndex: number;
  speedEventsIndex: number;
  cosr: number;
  sinr: number;
  imageW: number;
  imageH: number;
  imageD: boolean;
  imageU: boolean;
  imageS: number;
  imageA: number;
  imageL: [ImageBitmap, ImageBitmap, null, ImageBitmap];
  imageC: boolean;
  scaleXVal?: number;
  scaleYVal?: number;
  scaleXTrack?: RpeTrack;
  scaleYTrack?: RpeTrack;
  colorVal?: [number, number, number];
  colorTrack?: RpeColorTrack;
  textVal?: string;
  textTrack?: RpeTextTrack;
  controls?: LineControlTracks;
}
interface BlockAreaExtends extends BlockArea {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rawHeight: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  cosr: number;
  sinr: number;
  yScale: number;
  transA: number;
  transB: number;
  transC: number;
  transD: number;
  visible: boolean;
  chartCenter: { x: number; y: number };
  chartSize: { x: number; y: number };
  chartRotation: number;
}
interface ChartExtends extends Chart {
  maxSeconds: number;
  judgeLineList: JudgeLineExtends[];
  blockAreaList: BlockAreaExtends[];
}
interface EventSeconds {
  startTime: number;
  endTime: number;
  startSeconds: number;
  endSeconds: number;
}

function blockEasing(ease: number, u: number): number {
  u = Math.max(0, Math.min(1, u));
  if (ease <= 0) return u;
  if (ease >= 14) return 1;
  if (ease === 13) return 0;
  const power = Math.floor((ease - 1) / 3) + 2;
  const type = (ease - 1) % 3;
  if (type === 0) return u ** power;
  if (type === 1) return 1 - (1 - u) ** power;
  if (u < 0.5) return (2 ** (power - 1)) * (u ** power);
  return 1 - ((2 - 2 * u) ** power) / 2;
}

function lastEventIndex<T extends { time: number }>(events: T[], t: number): number {
  if (events.length === 0 || t < events[0].time) return -1;
  let lo = 0;
  let hi = events.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].time <= t) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return hi;
}

function pctToChart(p: { x: number; y: number }, aspect: number): { x: number; y: number } {
  return {
    x: 2 * p.x - 1,
    y: (2 * p.y - 1) / aspect
  };
}

function chartToCanvas(p: { x: number; y: number }, aspect: number, W: number, H: number): { x: number; y: number } {
  return {
    x: (p.x + 1) * 0.5 * W,
    y: (1 - p.y * aspect) * 0.5 * H
  };
}

function scaleCenter(
  center: { x: number; y: number },
  anchor: { x: number; y: number },
  next: { x: number; y: number },
  current: { x: number; y: number }
): { x: number; y: number } {
  const div = (a: number, b: number) => (Math.abs(b) < 1e-6 ? 1 : a / b);
  return {
    x: anchor.x + div(next.x, current.x) * (center.x - anchor.x),
    y: anchor.y + div(next.y, current.y) * (center.y - anchor.y)
  };
}

function rotateCenter(
  center: { x: number; y: number },
  anchor: { x: number; y: number },
  deltaDeg: number
): { x: number; y: number } {
  const rad = deltaDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = center.x - anchor.x;
  const dy = center.y - anchor.y;
  return {
    x: anchor.x + cos * dx - sin * dy,
    y: anchor.y + sin * dx + cos * dy
  };
}

function computeBlockAreaTransform(
  blockArea: BlockAreaExtends,
  time: number,
  aspect: number,
  line?: any,
  canvasWidth = 1350,
  canvasHeight = 900
) {
  if (blockArea.rpeArea?.computeTransform) {
    return blockArea.rpeArea.computeTransform(time, aspect, line, canvasWidth, canvasHeight);
  }
  const bl = pctToChart(blockArea.bottomLeftPercentage, aspect);
  const tr = pctToChart(blockArea.topRightPercentage, aspect);
  const baseSize = { x: tr.x - bl.x, y: tr.y - bl.y };
  const c = { x: (bl.x + tr.x) * 0.5, y: (bl.y + tr.y) * 0.5 };

  // 1. Scale
  let scale = { x: 1, y: 1 };
  const scaleEvents = blockArea.scaleEvents;
  const scaleIdx = lastEventIndex(scaleEvents, time);
  if (scaleEvents.length > 0) {
    if (scaleIdx === -1) {
      scale = { x: 1, y: 1 };
    } else if (scaleIdx + 1 >= scaleEvents.length) {
      scale = { x: scaleEvents[scaleIdx].scale.x, y: scaleEvents[scaleIdx].scale.y };
    } else {
      const cur = scaleEvents[scaleIdx];
      const next = scaleEvents[scaleIdx + 1];
      const norm = next.time <= cur.time ? 1 : Math.max(0, Math.min(1, (time - cur.time) / (next.time - cur.time)));
      const px = blockEasing(cur.easeTypeX, norm);
      const py = blockEasing(cur.easeTypeY, norm);
      scale = {
        x: cur.scale.x + px * (next.scale.x - cur.scale.x),
        y: cur.scale.y + py * (next.scale.y - cur.scale.y)
      };
    }
  }

  // 2. Rotation (counter-clockwise in chart space, degrees)
  let rotation = 0;
  const rotateEvents = blockArea.rotateEvents;
  const rotIdx = lastEventIndex(rotateEvents, time);
  if (rotateEvents.length > 0) {
    if (rotIdx === -1) {
      rotation = 0;
    } else if (rotIdx + 1 >= rotateEvents.length) {
      rotation = rotateEvents[rotIdx].rotation;
    } else {
      const cur = rotateEvents[rotIdx];
      const next = rotateEvents[rotIdx + 1];
      const norm = next.time <= cur.time ? 1 : Math.max(0, Math.min(1, (time - cur.time) / (next.time - cur.time)));
      const p = blockEasing(cur.easeType, norm);
      rotation = cur.rotation + p * (next.rotation - cur.rotation);
    }
  }

  // 3. Cumulative center from anchor history
  let center = { x: c.x, y: c.y };
  if (scaleEvents.length > 0 && scaleIdx !== -1) {
    for (let k = 0; k < scaleIdx; k++) {
      const cur = scaleEvents[k];
      const curAnchor = pctToChart(cur.anchor, aspect);
      center = scaleCenter(center, curAnchor, scaleEvents[k + 1].scale, cur.scale);
    }
    if (scaleIdx + 1 < scaleEvents.length) {
      const cur = scaleEvents[scaleIdx];
      const curAnchor = pctToChart(cur.anchor, aspect);
      center = scaleCenter(center, curAnchor, scale, cur.scale);
    }
  }

  if (rotateEvents.length > 0 && rotIdx !== -1) {
    for (let k = 0; k < rotIdx; k++) {
      const cur = rotateEvents[k];
      const curAnchor = pctToChart(cur.anchor, aspect);
      center = rotateCenter(center, curAnchor, rotateEvents[k + 1].rotation - cur.rotation);
    }
    if (rotIdx + 1 < rotateEvents.length) {
      const cur = rotateEvents[rotIdx];
      const curAnchor = pctToChart(cur.anchor, aspect);
      center = rotateCenter(center, curAnchor, rotation - cur.rotation);
    }
  }

  // 4. Movement (adds delta from base center c)
  const moveEvents = blockArea.moveEvents;
  if (moveEvents.length > 0) {
    const moveIdx = lastEventIndex(moveEvents, time);
    if (moveIdx !== -1) {
      let moveTarget: { x: number; y: number };
      if (moveIdx + 1 >= moveEvents.length) {
        moveTarget = pctToChart(moveEvents[moveIdx].endPosition, aspect);
      } else {
        const cur = moveEvents[moveIdx];
        const next = moveEvents[moveIdx + 1];
        const norm = next.time <= cur.time ? 1 : Math.max(0, Math.min(1, (time - cur.time) / (next.time - cur.time)));
        const px = blockEasing(cur.easeTypeX, norm);
        const py = blockEasing(cur.easeTypeY, norm);
        moveTarget = pctToChart({
          x: cur.endPosition.x + px * (next.endPosition.x - cur.endPosition.x),
          y: cur.endPosition.y + py * (next.endPosition.y - cur.endPosition.y)
        }, aspect);
      }
      center.x += moveTarget.x - c.x;
      center.y += moveTarget.y - c.y;
    }
  }

  const size = {
    x: Math.abs(baseSize.x * scale.x),
    y: Math.abs(baseSize.y * scale.y)
  };

  return {
    center,
    size,
    rotation,
    scale
  };
}

export class Renderer {
  //   容器和画布上下文
  public stage: HTMLDivElement;
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public canvasfg: HTMLCanvasElement;
  public ctxfg: CanvasRenderingContext2D;
  /** Half of the width of the canvas. */
  public wlen: number;
  /** Half of the height of the canvas. */
  public hlen: number;
  public scaleX: number;
  public scaleY: number;
  private width: number;
  private height: number;
  private matX: (x: number) => number;
  private matY: (y: number) => number;
  private matR: (r: number) => number;
  //   用户设置项
  public speed: number;
  public lineScale: number;
  public noteScale: number;
  public noteScaleRatio: number;
  public brightness: number;
  public multiHint: boolean;
  public playMode: number;
  public musicVolume: number;
  public soundVolume: number;
  public enableFR: boolean;
  public enableVP: boolean;
  public lowResFactor: number;
  //   谱面数据
  public readonly lines: JudgeLineExtends[];
  public readonly notes: NoteExtends[];
  public readonly taps: NoteExtends[];
  public readonly drags: NoteExtends[];
  public readonly flicks: NoteExtends[];
  public readonly holds: NoteExtends[];
  /** Render-only order; `lines` always remains in chart-index order. */
  public lineRenderOrder: JudgeLineExtends[];
  public linesReversed: JudgeLineExtends[];
  public notesReversed: NoteExtends[];
  public tapsReversed: NoteExtends[];
  public dragsReversed: NoteExtends[];
  public flicksReversed: NoteExtends[];
  public holdsReversed: NoteExtends[];
  public readonly tapholds: NoteExtends[];
  public readonly blockAreas: BlockAreaExtends[];
  //   资源数据
  public chart: ChartExtends | null;
  public bgMusic: AudioBuffer | null;
  public bgVideo: HTMLVideoElement | null;
  private _mirrorType: number;
  private initialized: boolean;
  public constructor(stage: unknown) {
    if (!(stage instanceof HTMLDivElement)) throw new Error('Not a container');
    const fail = () => { throw new Error('Failed to initialize canvas') };
    this.stage = stage;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false }) || fail(); //   游戏界面(alpha:false会使Firefox显示异常/需要验证)
    this.canvasfg = document.createElement('canvas'); //   绘制游戏主界面(OffscreenCanvas会使Safari崩溃)
    this.ctxfg = this.canvasfg.getContext('2d') || fail();
    this.stage.appendChild(this.canvas);
    this.canvas.style.cssText = ';position:absolute;top:0px;left:0px;right:0px;bottom:0px';
    console.log('Hello, Phi\x67ros Simulator!');
    // config
    this.speed = 1;
    this.lineScale = 57.6;
    this.noteScale = 1; //   note缩放设定值
    this.noteScaleRatio = 8e3; //   note缩放比率，由noteScale计算而来
    this.brightness = 0.6;
    // this.songName = '';
    // this.chartLevel = '';
    // this.illustrator = '';
    // this.chartDesign = '';
    // this.feedback = true;
    // this.imageBlur = true;
    this.multiHint = true;
    // this.hitSound = true;
    // this.anchorPoint = false;
    // this.coloredLine = true;
    // this.perfectLine = '#feffa9';
    // this.goodLine = '#a2eeff';
    // this.perfectNote = '#ffeca0';
    // this.goodNote = '#b4e1ff';
    // this.badNote = '#6c4343';
    this.playMode = 1; // 0:game,1:auto,2:hyper,3:auto&hyper
    this.musicVolume = 1;
    this.soundVolume = 1;
    // this.showTransition = true;
    // this.chartOffset = 0;
    this._mirrorType = 0;
    this.enableFR = false;
    this.enableVP = false;
    // chart
    this.chart = null;
    this.bgMusic = null;
    this.bgVideo = null;
    this.lines = [];
    this.notes = [];
    this.taps = [];
    this.drags = [];
    this.flicks = [];
    this.holds = [];
    this.lineRenderOrder = [];
    this.linesReversed = [];
    this.notesReversed = [];
    this.tapsReversed = [];
    this.dragsReversed = [];
    this.flicksReversed = [];
    this.holdsReversed = [];
    this.tapholds = [];
    this.blockAreas = [];
    // canvas
    this.lowResFactor = 1;
    this.width = 0;
    this.height = 0;
    this.wlen = 0;
    this.hlen = 0;
    this.scaleX = 0;
    this.scaleY = 0;
    this.matX = x => x;
    this.matY = y => y;
    this.matR = r => r;
    this.initialized = false;
    // event
    this._setLowResFactor(1);
    this.resizeCanvas();
  }
  public get duration(): number {
    if (this.bgMusic) return this.bgMusic.duration;
    if (this.chart) return this.chart.maxSeconds + 0.5;
    throw new TypeError('Illegal state');
  }
  // config
  public setNoteScale(num = 1): void {
    this.noteScale = num;
    this.noteScaleRatio = this.canvasfg.width * this.noteScale / 8080; //   note、特效缩放
  }
  public setLowResFactor(num = 1): void {
    this._setLowResFactor(num);
    this._resizeCanvas();
  }
  public resizeCanvas(): void {
    const { width, height } = this.stage.getBoundingClientRect();
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.canvas.style.cssText += `;width:${width.toFixed(3)}px;height:${height.toFixed(3)}px`; //   只有inset还是会溢出
    this._resizeCanvas();
  }
  public mirrorView(code = this._mirrorType): void {
    const n = 3 & code;
    this._mirrorType = n;
    this.transformView(1 & n ? -1 : 1, 2 & n ? -1 : 1, 0, 0);
  }
  public transformView(scaleX = 1, scaleY = 1, offsetX = 0, offsetY = 0): void {
    const { canvasfg } = this;
    const xa = canvasfg.width * scaleX;
    const xb = (canvasfg.width - xa) * 0.5;
    const ya = -canvasfg.height * scaleY;
    const yb = (canvasfg.height - ya) * 0.5;
    const ra = -Math.sign(scaleX * scaleY) * Math.PI / 180;
    const rb = scaleY > 0 ? 0 : Math.PI;
    const tx = Math.sign(scaleY) * xa * 0.05625;
    const ty = Math.sign(scaleY) * -ya * 0.6; //   控制note流速
    this.matX = x => xb + xa * (x - offsetX);
    this.matY = y => yb + ya * (y - offsetY);
    this.matR = r => rb + ra * r;
    this.scaleX = tx;
    this.scaleY = ty;
    this.initialized = true;
  }
  //   note预处理
  public prerenderChart(chart: Chart): void {
    this.lines.length = 0;
    this.lineRenderOrder.length = 0;
    this.notes.length = 0;
    this.taps.length = 0;
    this.drags.length = 0;
    this.flicks.length = 0;
    this.holds.length = 0;
    this.tapholds.length = 0;
    this.blockAreas.length = 0;
    const chartNew = chart.duplicate() as ChartExtends;
    for (const line of chartNew.judgeLineList) {
      let y = Math.fround(line.speedEvents[0].startTime / line.bpm * 1.875);
      let y2 = y; // float32
      for (const evt of line.speedEvents) {
        evt.floorPosition = y;
        evt.floorPosition2 = y2;
        const dy = (evt.endTime - evt.startTime) / line.bpm * 1.875;
        y += dy * evt.value;
        y2 += Math.fround(Math.fround(dy) * evt.value);
        y = Math.fround(y);
        y2 = Math.fround(y2);
      }
    }
    const ss = {
      aniStart: 1e9,
      aniEnd: 0,
      hitStart: 1e9,
      hitEnd: 0
    };
    const aniUpdate = (seconds: number) => {
      if (seconds < ss.aniStart) ss.aniStart = seconds;
      if (seconds > ss.aniEnd) ss.aniEnd = seconds;
    };
    const hitUpdate = (seconds: number) => {
      aniUpdate(seconds);
      if (seconds < ss.hitStart) ss.hitStart = seconds;
      if (seconds > ss.hitEnd) ss.hitEnd = seconds;
    };
    //   添加seconds
    const addSeconds = (events: EventSeconds[], bpm: number) => {
      for (const evt of events) {
        evt.startSeconds = evt.startTime / bpm * 1.875;
        evt.endSeconds = evt.endTime / bpm * 1.875;
        if (evt.startTime > 1 - 1e6) aniUpdate(evt.startSeconds);
        if (evt.endTime < 1e9 && evt.endTime !== events[events.length - 1].endTime) aniUpdate(evt.endSeconds);
      }
    };
    //   获取note最大可见位置
    const getMaxVisiblePos = (x: number) => {
      const n = Math.fround(x);
      if (!isFinite(n)) throw new TypeError('Argument must be a finite number');
      const magic = 11718.75;
      const prime = n >= magic ? 2 ** Math.floor(1 + Math.log2(n / magic)) : 1;
      const a = n / prime + 0.001;
      const r = Math.fround(a);
      if (r <= a) return r * prime;
      const a_ = new Float32Array([a]);
      new Uint32Array(a_.buffer)[0] += a_[0] <= 0 ? 1 : -1;
      return a_[0] * prime;
    };
    //   向Renderer添加Note
    const addNote = (note: NoteExtends, beat32: number, line: JudgeLineExtends, noteId: number, isAbove: boolean) => {
      note.offsetX = 0;
      note.offsetY = 0;
      note.baseAlpha = note.alpha != null ? Math.max(0, Math.min(255, Number(note.alpha))) / 255 : 1;
      note.alpha = 0;
      note.controlPos = 1;
      note.controlSize = 1;
      note.controlAlpha = 1;
      note.controlSkew = 0;
      note.seconds = note.time * beat32;
      note.holdSeconds = note.holdTime * beat32;
      note.maxVisiblePos = getMaxVisiblePos(note.floorPosition);
      if (note.time < 1e9) {
        hitUpdate(note.seconds);
        hitUpdate(note.seconds + note.holdSeconds);
      }
      note.line = line;
      note.lineId = line.lineId;
      note.noteId = noteId;
      note.isAbove = isAbove;
      note.name = `${line.lineId}${isAbove ? '+' : '-'}${noteId}${'?tdhf'[note.type]}`;
      this.notes.push(note);
      if (note.type === 1) this.taps.push(note);
      else if (note.type === 2) this.drags.push(note);
      else if (note.type === 3) this.holds.push(note);
      else if (note.type === 4) this.flicks.push(note);
      if (note.type === 1 || note.type === 3) this.tapholds.push(note);
    };
    const sortNote = (a: NoteExtends, b: NoteExtends) => a.seconds - b.seconds || a.lineId - b.lineId || a.noteId - b.noteId;
    //   优化events
    chartNew.judgeLineList.forEach((i, lineId) => i.lineId = lineId);
    for (const line of chartNew.judgeLineList) {
      line.bpm *= this.speed;
      line.offsetX = 0;
      line.offsetY = 0;
      line.alpha = 0;
      line.rotation = 0;
      line.positionY = 0; //   临时过渡用
      line.positionY2 = 0;
      line.scaleXVal = 1;
      line.scaleYVal = 1;
      const tempo = chartNew.bpmList?.length
        ? new RPETempo(chartNew.bpmList)
        : new RPETempo([{ startTime: [0, 0, 1], bpm: line.bpm }]);
      if (line.scaleXEvents?.length) {
        line.scaleXTrack = new RpeTrack(line.scaleXEvents, 'X', 1, { x: 0, y: 0 }, tempo);
      }
      if (line.scaleYEvents?.length) {
        line.scaleYTrack = new RpeTrack(line.scaleYEvents, 'Y', 1, { x: 0, y: 0 }, tempo);
      }
      if (line.colorEvents?.length) {
        line.colorTrack = new RpeColorTrack(line.colorEvents, [255, 255, 255], tempo);
        line.colorVal = [255, 255, 255];
      }
      if (line.textEvents?.length) {
        line.textTrack = new RpeTextTrack(line.textEvents, '', tempo);
        line.textVal = '';
      }
      line.controls = createControlTracks(line);
      // line.speedEvents = normalizeSpeedEvent(line.speedEvents) as SpeedEventExtends[];
      // line.judgeLineDisappearEvents = normalizeLineEvent(line.judgeLineDisappearEvents) as LineEventExtends[];
      // line.judgeLineMoveEvents = normalizeLineEvent(line.judgeLineMoveEvents) as LineEventExtends[];
      // line.judgeLineRotateEvents = normalizeLineEvent(line.judgeLineRotateEvents) as LineEventExtends[];
      line.disappearEventsIndex = 0;
      line.moveEventsIndex = 0;
      line.rotateEventsIndex = 0;
      line.speedEventsIndex = 0;
      addSeconds(line.speedEvents, line.bpm);
      addSeconds(line.judgeLineDisappearEvents, line.bpm);
      addSeconds(line.judgeLineMoveEvents, line.bpm);
      addSeconds(line.judgeLineRotateEvents, line.bpm);
      this.lines.push(line); //   TODO: 可以定义新类避免函数在循环里定义
      line.notesAbove.forEach((j, noteId) => addNote(j, 1.875 / line.bpm, line, noteId, true));
      line.notesBelow.forEach((j, noteId) => addNote(j, 1.875 / line.bpm, line, noteId, false));
    }
    //   处理BlockArea
    for (const blockArea of chartNew.blockAreaList) {
      blockArea.centerX = 0;
      blockArea.centerY = 0;
      blockArea.width = 0;
      blockArea.height = 0;
      blockArea.rawHeight = 0;
      blockArea.scaleX = 1;
      blockArea.scaleY = 1;
      blockArea.rotation = 0;
      blockArea.cosr = 1;
      blockArea.sinr = 0;
      blockArea.yScale = 1;
      blockArea.transA = 1;
      blockArea.transB = 0;
      blockArea.transC = 0;
      blockArea.transD = 1;
      blockArea.visible = false;
      blockArea.chartCenter = { x: 0, y: 0 };
      blockArea.chartSize = { x: 0, y: 0 };
      blockArea.chartRotation = 0;
      aniUpdate(blockArea.disappearTime);

      this.blockAreas.push(blockArea);
    }
    this.notes.sort(sortNote);
    this.taps.sort(sortNote);
    this.drags.sort(sortNote);
    this.holds.sort(sortNote);
    this.flicks.sort(sortNote);
    // Match Phira-Pro's approach: preserve line indices for data references
    // (including attachUI and line images), while using a separate stable
    // ordering for visual layering. Lower zOrder is drawn first (below),
    // higher zOrder is drawn on top. Ascending line-id tie break preserves
    // the natural chart creation order (backgrounds/overlays below foregrounds/text).
    this.lineRenderOrder = this.lines
      .filter(line => !line.attachUI)
      .toSorted((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0) || a.lineId - b.lineId);
    this.notesReversed = this.notes.toReversed();
    this.tapsReversed = this.taps.toReversed();
    this.dragsReversed = this.drags.toReversed();
    this.holdsReversed = this.holds.toReversed();
    this.flicksReversed = this.flicks.toReversed();
    this.linesReversed = this.lines.toReversed();
    this.tapholds.sort(sortNote);
    //   多押标记
    const timeOfMulti: Record<string, number> = {};
    for (const note of this.notes) timeOfMulti[note.seconds.toFixed(6)] = timeOfMulti[note.seconds.toFixed(6)] ? 2 : 1;
    for (const note of this.notes) note.isMulti = timeOfMulti[note.seconds.toFixed(6)] === 2;
    //   分析邻近Note(0.01s内标记，用于预处理Flick,TapHold重叠判定)
    for (let i = 0; i < this.flicks.length; i++) {
      const note = this.flicks[i];
      note.nearNotes = [];
      for (let j = i + 1; j < this.flicks.length; j++) {
        const note2 = this.flicks[j];
        if (Math.fround(note2.seconds - note.seconds) > 0.01) break;
        note.nearNotes.push(note2);
      }
    }
    for (let i = 0; i < this.tapholds.length; i++) {
      const note = this.tapholds[i];
      note.nearNotes = [];
      for (let j = i + 1; j < this.tapholds.length; j++) {
        const note2 = this.tapholds[j];
        if (Math.fround(note2.seconds - note.seconds) > 0.01) break;
        note.nearNotes.push(note2);
      }
    }
    this.chart = chartNew;
    this.chart.maxSeconds = ss.aniEnd;
    console.table(ss);
  }
  /*  * 从0开始，将事件index定位到正确位置   */
  public seekLineEventIndex(time?: number): void {
    if (!this.initialized) throw new Error('Not initialized');
    for (const line of this.lines) {
      line.speedEventsIndex = 0;
      line.disappearEventsIndex = 0;
      line.moveEventsIndex = 0;
      line.rotateEventsIndex = 0;
      if (time == null) continue;
      while (line.speedEventsIndex < line.speedEvents.length && line.speedEvents[line.speedEventsIndex].endSeconds < time) line.speedEventsIndex++;
      while (line.disappearEventsIndex < line.judgeLineDisappearEvents.length && line.judgeLineDisappearEvents[line.disappearEventsIndex].endSeconds < time) line.disappearEventsIndex++;
      while (line.moveEventsIndex < line.judgeLineMoveEvents.length && line.judgeLineMoveEvents[line.moveEventsIndex].endSeconds < time) line.moveEventsIndex++;
      while (line.rotateEventsIndex < line.judgeLineRotateEvents.length && line.judgeLineRotateEvents[line.rotateEventsIndex].endSeconds < time) line.rotateEventsIndex++;
    }

  }
  public updateByTime(time: number): void {
    if (!this.initialized) throw new Error('Not initialized');
    for (const line of this.lines) {
      for (let i = line.disappearEventsIndex, len = line.judgeLineDisappearEvents.length; i < len; i++) {
        const evt = line.judgeLineDisappearEvents[i];
        if (time > evt.endSeconds) continue;
        const dt = (time - evt.startSeconds) / (evt.endSeconds - evt.startSeconds);
        line.alpha = evt.start + (evt.end - evt.start) * dt;
        if (line.alpha > 1) line.alpha = 1;
        line.disappearEventsIndex = i;
        break;
      }
      for (let i = line.moveEventsIndex, len = line.judgeLineMoveEvents.length; i < len; i++) {
        const evt = line.judgeLineMoveEvents[i];
        if (time > evt.endSeconds) continue;
        const dt = (time - evt.startSeconds) / (evt.endSeconds - evt.startSeconds);
        line.offsetX = this.matX(evt.start + (evt.end - evt.start) * dt);
        line.offsetY = this.matY(evt.start2 + (evt.end2 - evt.start2) * dt);
        line.moveEventsIndex = i;
        break;
      }
      for (let i = line.rotateEventsIndex, len = line.judgeLineRotateEvents.length; i < len; i++) {
        const evt = line.judgeLineRotateEvents[i];
        if (time > evt.endSeconds) continue;
        const dt = (time - evt.startSeconds) / (evt.endSeconds - evt.startSeconds);
        line.rotation = this.matR(evt.start + (evt.end - evt.start) * dt);
        line.cosr = Math.cos(line.rotation);
        line.sinr = Math.sin(line.rotation);
        line.rotateEventsIndex = i;
        break;
      }
      if (line.scaleXTrack) {
        line.scaleXVal = line.scaleXTrack.sample(time)[0];
      }
      if (line.scaleYTrack) {
        line.scaleYVal = line.scaleYTrack.sample(time)[0];
      }
      if (line.colorTrack) {
        line.colorVal = line.colorTrack.sample(time);
      }
      if (line.textTrack) {
        line.textVal = line.textTrack.sample(time);
      }
      for (let i = line.speedEventsIndex, len = line.speedEvents.length; i < len; i++) {
        const evt = line.speedEvents[i];
        if (time > evt.endSeconds) continue;
        line.positionY = (time - evt.startSeconds) * this.speed * evt.value + (this.enableFR ? evt.floorPosition2 : evt.floorPosition);
        line.positionY2 = (time - evt.startSeconds) * this.speed * evt.value + evt.floorPosition2;
        line.speedEventsIndex = i;
        break;
      }
      const getGoodY = (i: NoteExtends) => {
        if (i.type !== 3) return (i.floorPosition - line.positionY) * i.speed;
        if (i.seconds < time) return (i.seconds - time) * this.speed * i.speed;
        return i.floorPosition - line.positionY;
      };
      const getBadY = (i: NoteExtends) => {
        if (i.badTime == null) return getGoodY(i);
        if (performance.now() - i.badTime > 500) delete i.badTime;
        if (i.badY == null) i.badY = getGoodY(i);
        return i.badY;
      };
      const setAlpha = (i: NoteExtends, dx: number, dy: number, effBadY: number) => {
        i.projectX = line.offsetX + dx * i.cosr;
        i.offsetX = i.projectX + dy * i.sinr;
        i.projectY = line.offsetY + dx * i.sinr;
        i.offsetY = i.projectY - dy * i.cosr;
        i.visible = (i.offsetX - this.wlen) ** 2 + (i.offsetY - this.hlen) ** 2 < (this.wlen * 1.23625 + this.hlen + this.scaleY * i.holdSeconds * this.speed * i.speed) ** 2; //   Math.hypot实测性能较低
        i.showPoint = false;
        if (i.badTime != null) {
          // Not bad
        } else if (i.seconds > time) {
          i.showPoint = true;
          const isHidden = (line.isCover !== 0 && i.maxVisiblePos < line.positionY2) || (i.visibleTime < 75000 && (i.seconds - time > i.visibleTime));
          const base = isHidden || (this.enableVP && (effBadY + (i.yOffset || 0)) * 0.6 > 2) || (i.type === 3 && i.speed === 0) ? 0 : 1;
          i.alpha = base * i.baseAlpha * (i.controlAlpha ?? 1);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          i.frameCount = i.frameCount == null ? 0 : i.frameCount + 1;
          if (i.type === 3) {
            i.showPoint = true;
            i.alpha = (i.speed === 0 ? 0 : i.status % 4 === 2 ? 0.45 : 1) * i.baseAlpha * (i.controlAlpha ?? 1);
          } else {
            const fadeDuration = (line.isCover === 0 || (i.line && i.line.isCover === 0)) ? 2.0 : 0.16;
            i.alpha = Math.max(1 - (time - i.seconds) / fadeDuration, 0) * i.baseAlpha * (i.controlAlpha ?? 1);
          }
        }
      };

      const controls = line.controls;
      const hasControls = controls && controls.hasAny;

      for (const note of line.notesAbove) {
        note.cosr = line.cosr;
        note.sinr = line.sinr;
        let effBadY = getBadY(note);
        if (hasControls) {
          const distRpe = (effBadY + (note.yOffset || 0)) * 540;
          if (controls.y) {
            effBadY *= controls.y.sample(distRpe);
          }
          note.controlPos = controls.pos ? controls.pos.sample(distRpe) : 1;
          note.controlSize = controls.size ? controls.size.sample(distRpe) : 1;
          note.controlAlpha = controls.alpha ? controls.alpha.sample(distRpe) : 1;
          note.controlSkew = controls.skew ? controls.skew.sample(distRpe) : 0;
        } else {
          note.controlPos = 1;
          note.controlSize = 1;
          note.controlAlpha = 1;
          note.controlSkew = 0;
        }
        setAlpha(note, this.scaleX * (note.positionX * note.controlPos), this.scaleY * (effBadY + (note.yOffset || 0)), effBadY);
      }
      for (const note of line.notesBelow) {
        note.cosr = -line.cosr;
        note.sinr = -line.sinr;
        let effBadY = getBadY(note);
        if (hasControls) {
          const distRpe = (effBadY + (note.yOffset || 0)) * 540;
          if (controls.y) {
            effBadY *= controls.y.sample(distRpe);
          }
          note.controlPos = controls.pos ? controls.pos.sample(distRpe) : 1;
          note.controlSize = controls.size ? controls.size.sample(distRpe) : 1;
          note.controlAlpha = controls.alpha ? controls.alpha.sample(distRpe) : 1;
          note.controlSkew = controls.skew ? controls.skew.sample(distRpe) : 0;
        } else {
          note.controlPos = 1;
          note.controlSize = 1;
          note.controlAlpha = 1;
          note.controlSkew = 0;
        }
        setAlpha(note, -this.scaleX * (note.positionX * note.controlPos), this.scaleY * (effBadY + (note.yOffset || 0)), effBadY);
      }
    }
    const W = this.canvasfg.width;
    const H = this.canvasfg.height;
    const aspect = H > 0 ? W / H : 1;
    for (const blockArea of this.blockAreas) {
      if (blockArea.rpeArea?.isVisible) {
        blockArea.visible = blockArea.rpeArea.isVisible(time);
      } else {
        blockArea.visible = time >= blockArea.appearTime && time < blockArea.disappearTime;
      }
      if (!blockArea.visible) continue;

      const line = blockArea.lineIndex != null ? this.lines[blockArea.lineIndex] : undefined;
      const tr = computeBlockAreaTransform(blockArea, time, aspect, line, W, H);
      const canvasPos = chartToCanvas(tr.center, aspect, W, H);
      const yScale = blockArea.rpeCanvas ? 1.5 / aspect : 1.0;
      const rot = (tr.rotation || 0) * Math.PI / 180;
      const cosr = Math.cos(rot);
      const sinr = Math.sin(rot);

      blockArea.centerX = canvasPos.x;
      blockArea.centerY = canvasPos.y;
      blockArea.width = tr.size.x * 0.5 * W;
      blockArea.rawHeight = tr.size.y * 0.5 * W;
      blockArea.height = blockArea.rawHeight * yScale;
      blockArea.scaleX = tr.scale.x;
      blockArea.scaleY = tr.scale.y;
      blockArea.rotation = rot;
      blockArea.cosr = cosr;
      blockArea.sinr = sinr;
      blockArea.yScale = yScale;
      blockArea.transA = cosr;
      blockArea.transB = yScale * sinr;
      blockArea.transC = -sinr;
      blockArea.transD = yScale * cosr;
      blockArea.chartCenter = tr.center;
      blockArea.chartSize = tr.size;
      blockArea.chartRotation = tr.rotation;
    }
  }
  private _setLowResFactor(num = 1) {
    this.lowResFactor = num;
  }
  private _resizeCanvas() {
    const { canvas, canvasfg, width, height } = this;
    const lowResFactor = this.lowResFactor * self.devicePixelRatio;
    const widthLowRes = width * lowResFactor;
    const heightLowRes = height * lowResFactor;
    canvas.width = widthLowRes;
    canvas.height = heightLowRes;
    canvasfg.width = Math.min(widthLowRes, heightLowRes * 16 / 9);
    canvasfg.height = heightLowRes;
    this.wlen = canvasfg.width / 2;
    this.hlen = canvasfg.height / 2;
    this.mirrorView();
    this.setNoteScale(this.noteScale);
    this.lineScale = canvasfg.width > canvasfg.height * 0.75 ? canvasfg.height / 18.75 : canvasfg.width / 14.0625; //   判定线、文字缩放
  }
}
export namespace Renderer {
  export type Note = NoteExtends;
  export type JudgeLine = JudgeLineExtends;
  export type BlockArea = BlockAreaExtends;
}
//   // 规范判定线事件
// function normalizeLineEvent(events: JudgeLineEvent[]) {
//     const oldEvents = events.map(i => new JudgeLineEvent(i as unknown as Record<string, unknown>)); // 深拷贝
//     if (!oldEvents.length) return [new JudgeLineEvent({ startTime: -999999, endTime: 1e9 })]; // 如果没有事件，添加一个默认事件(以后添加warning)
//   const newEvents = [
//     new JudgeLineEvent({
//       startTime: -999999,
//       endTime: 0,
//       start: oldEvents[0].start,
//       end: oldEvents[0].start,
//       start2: oldEvents[0].start2,
//       end2: oldEvents[0].start2
//     })
//     ]; // 以1-1e6开头
//   oldEvents.push(new JudgeLineEvent({
//     startTime: oldEvents[oldEvents.length - 1].endTime,
//     endTime: 1e9,
//     start: oldEvents[oldEvents.length - 1].end,
//     end: oldEvents[oldEvents.length - 1].end,
//     start2: oldEvents[oldEvents.length - 1].end2,
//     end2: oldEvents[oldEvents.length - 1].end2
//     })); // 以1e9结尾
//   for (const i2 of oldEvents) {
//       // 保证时间连续性
//     if (i2.startTime > i2.endTime) continue;
//     const i1 = newEvents[newEvents.length - 1];
//     if (i1.endTime > i2.endTime) {
//         // 忽略
//     } else if (i1.endTime === i2.startTime) newEvents.push(i2);
//     else if (i1.endTime < i2.startTime) {
//       newEvents.push(new JudgeLineEvent({
//         startTime: i1.endTime,
//         endTime: i2.startTime,
//         start: i1.end,
//         end: i1.end,
//         start2: i1.end2,
//         end2: i1.end2
//       }), i2);
//     } else if (i1.endTime > i2.startTime) {
//       newEvents.push(new JudgeLineEvent({
//         startTime: i1.endTime,
//         endTime: i2.endTime,
//         start: (i2.start * (i2.endTime - i1.endTime) + i2.end * (i1.endTime - i2.startTime)) / (i2.endTime - i2.startTime),
//         end: i1.end,
//         start2: (i2.start2 * (i2.endTime - i1.endTime) + i2.end2 * (i1.endTime - i2.startTime)) / (i2.endTime - i2.startTime),
//         end2: i1.end2
//       }));
//     }
//   }
//     // 合并相同变化率事件
//   const newEvents2 = [newEvents.shift()!];
//   for (const i2 of newEvents) {
//     const i1 = newEvents2[newEvents2.length - 1];
//     const d1 = i1.endTime - i1.startTime;
//     const d2 = i2.endTime - i2.startTime;
//     if (i2.startTime === i2.endTime) {
//         // 忽略
//     } else if (i1.end === i2.start && i1.end2 === i2.start2 && (i1.end - i1.start) * d2 === (i2.end - i2.start) * d1 && (i1.end2 - i1.start2) * d2 === (i2.end2 - i2.start2) * d1) {
//       i1.endTime = i2.endTime;
//       i1.end = i2.end;
//       i1.end2 = i2.end2;
//     } else newEvents2.push(i2);
//   }
//   return newEvents2;
// }
//   // 规范speedEvents
// function normalizeSpeedEvent(events: SpeedEvent[]) {
//   const newEvents = [];
//   for (const i2 of events) {
//     const i1 = newEvents[newEvents.length - 1];
//     if (i1?.value === i2.value) i1.endTime = i2.endTime;
//     else newEvents.push(i2);
//   }
//   return newEvents;
// }
