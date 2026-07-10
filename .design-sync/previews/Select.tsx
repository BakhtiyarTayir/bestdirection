import {
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "lms";

export const Basic = () => (
  <div className="w-[280px] space-y-2">
    <Label htmlFor="course">Курс</Label>
    <Select defaultValue="web">
      <SelectTrigger id="course">
        <SelectValue placeholder="Выберите курс" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="web">Веб-разработка</SelectItem>
        <SelectItem value="design">Графический дизайн</SelectItem>
        <SelectItem value="english">Английский язык</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

export const Placeholder = () => (
  <div className="w-[280px]">
    <Select>
      <SelectTrigger>
        <SelectValue placeholder="Выберите группу" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a1">Группа А-1</SelectItem>
        <SelectItem value="b2">Группа Б-2</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

export const Open = () => (
  <div className="h-[300px] w-[280px]">
    <Select defaultOpen defaultValue="ru">
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Язык обучения</SelectLabel>
          <SelectItem value="ru">Русский</SelectItem>
          <SelectItem value="uz">Узбекский</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);
