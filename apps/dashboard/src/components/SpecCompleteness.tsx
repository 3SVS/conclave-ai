type Props = { value: number };

export function SpecCompleteness({ value }: Props) {
  const color = value >= 80 ? "bg-green-500" : value >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-10 text-right">{value}%</span>
    </div>
  );
}
