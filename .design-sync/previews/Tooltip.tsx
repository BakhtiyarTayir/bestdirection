import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "lms";
import { CircleHelp, Plus, Trash2 } from "lucide-react";

export const IconButton = () => (
  <TooltipProvider>
    <div className="flex items-end justify-center" style={{ height: 120 }}>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button size="icon">
            <Plus className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Добавить домашнее задание</p>
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);

export const DangerAction = () => (
  <TooltipProvider>
    <div className="flex items-start justify-center" style={{ height: 120 }}>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Удалить урок из курса</p>
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);

export const HelpHint = () => (
  <TooltipProvider>
    <div className="flex items-center justify-center gap-2" style={{ height: 140 }}>
      <Badge variant="secondary">Средний балл: 4,6</Badge>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <CircleHelp className="h-4 w-4 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Учитываются оценки за домашние задания и тесты</p>
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);
