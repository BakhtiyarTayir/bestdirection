import { Avatar, AvatarFallback, AvatarImage } from "lms";

const teacherPhoto =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'>
      <rect width='80' height='80' fill='#4f46e5'/>
      <circle cx='40' cy='30' r='14' fill='#c7d2fe'/>
      <ellipse cx='40' cy='66' rx='24' ry='18' fill='#c7d2fe'/>
    </svg>`
  );

export const WithImage = () => (
  <div className="flex items-center gap-3">
    <Avatar>
      <AvatarImage src={teacherPhoto} alt="Азиз Насыров" />
      <AvatarFallback>АН</AvatarFallback>
    </Avatar>
    <div className="text-sm">
      <p className="font-medium">Азиз Насыров</p>
      <p className="text-muted-foreground">Преподаватель · Веб-разработка</p>
    </div>
  </div>
);

export const FallbackInitials = () => (
  <div className="flex items-center gap-3">
    <Avatar>
      <AvatarFallback>АК</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>МК</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>ДР</AvatarFallback>
    </Avatar>
  </div>
);

export const GroupStack = () => (
  <div className="flex items-center gap-3">
    <div className="flex">
      {(["АК", "МК", "ТЮ", "+9"] as const).map((label, i) => (
        <Avatar
          key={label}
          className="border-2"
          style={{
            borderColor: "hsl(var(--background))",
            marginLeft: i === 0 ? 0 : -12,
          }}
        >
          <AvatarFallback className={label === "+9" ? "text-xs" : undefined}>
            {label}
          </AvatarFallback>
        </Avatar>
      ))}
    </div>
    <span className="text-sm text-muted-foreground">Группа FR-24-01 · 12 студентов</span>
  </div>
);
