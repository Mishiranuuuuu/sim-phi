type Chart = import('@/utils/Chart').Chart;
type Note = import('@/utils/Chart').Note;
type JudgeLine = import('@/utils/Chart').JudgeLine;
type SpeedEvent = import('@/utils/Chart').SpeedEvent;
type JudgeLineEvent = import('@/utils/Chart').JudgeLineEvent;
type BlockArea = import('@/utils/Chart').BlockArea;
type BlockAreaRotateEvent = import('@/utils/Chart').BlockAreaRotateEvent;
type BlockAreaMoveEvent = import('@/utils/Chart').BlockAreaMoveEvent;
type BlockAreaScaleEvent = import('@/utils/Chart').BlockAreaScaleEvent;
interface ChartPGS {
  formatVersion?: number;
  offset: number;
  numOfNotes?: number;
  judgeLineList: JudgeLinePGS[];
  blockAreaList?: BlockAreaPGS[];
}
interface BlockAreaPGS {
  topRightPercentage: { x: number; y: number };
  bottomLeftPercentage: { x: number; y: number };
  appearTime: number;
  enableTime: number;
  disableTime: number;
  disappearTime: number;
  isSubtract: boolean;
  rotateEvents: { anchor: { x: number; y: number }; time: number; easeType: number; rotation: number }[];
  moveEvents: { endPosition: { x: number; y: number }; time: number; easeTypeX: number; easeTypeY: number }[];
  scaleEvents: { anchor: { x: number; y: number }; time: number; easeTypeX: number; easeTypeY: number; scale: { x: number; y: number } }[];
}
interface NotePGS {
  type: number;
  time: number;
  positionX: number;
  holdTime: number;
  speed: number;
  floorPosition: number;
}
interface JudgeLinePGS {
  bpm: number;
  numOfNotes?: number;
  numOfNotesAbove?: number;
  numOfNotesBelow?: number;
  notesAbove?: NotePGS[];
  notesBelow?: NotePGS[];
  speedEvents: SpeedEventPGS[];
  judgeLineDisappearEvents: JudgeLineEventPGS[];
  judgeLineMoveEvents: JudgeLineEventPGS[];
  judgeLineRotateEvents: JudgeLineEventPGS[];
}
interface SpeedEventPGS {
  startTime: number;
  endTime: number;
  value: number;
  floorPosition?: number;
  floorPosition2?: number; // float32
  floorPositionMin?: number;
}
interface JudgeLineEventPGS {
  startTime: number;
  endTime: number;
  start: number;
  end: number;
  start2?: number;
  end2?: number;
}
