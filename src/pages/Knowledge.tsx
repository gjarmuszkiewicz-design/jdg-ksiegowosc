import clsx from "clsx";
import { ArrowLeft, BookOpen, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { ARTICLES, searchArticles, type Article } from "@/lib/knowledge";

const CATEGORY_STYLE: Record<Article["category"], { tone: "blue" | "green" | "amber" | "violet" | "red" | "slate"; emoji: string }> = {
  Start: { tone: "slate", emoji: "🚀" },
  Faktury: { tone: "blue", emoji: "🧾" },
  Koszty: { tone: "amber", emoji: "💸" },
  VAT: { tone: "violet", emoji: "📊" },
  PIT: { tone: "green", emoji: "🏛️" },
  ZUS: { tone: "red", emoji: "🛡️" },
  KSeF: { tone: "blue", emoji: "☁️" },
  Optymalizacja: { tone: "green", emoji: "💡" },
};

const CATEGORIES = Object.keys(CATEGORY_STYLE) as Article["category"][];

function ArticleView({ article }: { article: Article }) {
  const navigate = useNavigate();
  const style = CATEGORY_STYLE[article.category];
  const related = ARTICLES.filter((a) => a.category === article.category && a.id !== article.id).slice(0, 3);
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/wiedza" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Baza wiedzy
      </Link>
      <Card className="p-7">
        <Badge tone={style.tone}>
          {style.emoji} {article.category}
        </Badge>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{article.title}</h1>
        <p className="mt-1 text-slate-500">{article.summary}</p>
        <div className="mt-6 space-y-4">
          {article.body.map((p, i) => (
            <div key={i} className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">{i + 1}</span>
              <p className="leading-relaxed text-slate-700">{p}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-50 to-brand-50 p-4">
          <Sparkles className="h-5 w-5 text-violet-600" />
          <span className="flex-1 text-sm text-slate-700">Masz pytanie do tego tematu? Asystent odpowie na Twoich danych i sprawdzi aktualne przepisy.</span>
          <Button onClick={() => navigate(`/asystent?pytanie=${encodeURIComponent(`${article.title} — wyjaśnij to na moim przykładzie`)}`)} icon={<Sparkles className="h-4 w-4" />}>
            Zapytaj AI o ten temat
          </Button>
        </div>
        <p className="mt-4 text-xs text-slate-400">Treści mają charakter informacyjny i opisują stan prawny na 2026 r. Przepisy się zmieniają — w razie wątpliwości sprawdź źródło lub skonsultuj się z doradcą.</p>
      </Card>
      {related.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Powiązane artykuły</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {related.map((a) => (
              <Link key={a.id} to={`/wiedza/${a.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                {a.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Knowledge() {
  const { id } = useParams();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Article["category"] | "">("");
  const results = useMemo(() => searchArticles(query).filter((a) => !category || a.category === category), [query, category]);

  const article = id && ARTICLES.find((a) => a.id === id);
  if (article) return <ArticleView article={article} />;

  return (
    <div>
      <PageHeader title="Baza wiedzy" subtitle="Najważniejsze zasady księgowości JDG wyjaśnione prostym językiem." />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj, np. „samochód”, „limit VAT”, „zdrowotna”…"
          className="input py-3.5 pl-12 text-base"
        />
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setCategory("")}
          className={clsx("rounded-full px-3.5 py-1.5 text-sm font-medium transition", !category ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow-sm hover:bg-slate-100")}
        >
          Wszystkie
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(category === c ? "" : c)}
            className={clsx("rounded-full px-3.5 py-1.5 text-sm font-medium transition", category === c ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow-sm hover:bg-slate-100")}
          >
            {CATEGORY_STYLE[c].emoji} {c}
          </button>
        ))}
      </div>
      {results.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="Nic nie znaleziono"
            description="Spróbuj innego słowa albo zapytaj asystenta AI — sprawdzi aktualne przepisy."
            action={<Button to={`/asystent?pytanie=${encodeURIComponent(query)}`} icon={<Sparkles className="h-4 w-4" />}>Zapytaj AI</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((a) => {
            const style = CATEGORY_STYLE[a.category];
            return (
              <Link key={a.id} to={`/wiedza/${a.id}`} className="group">
                <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:border-brand-200 group-hover:shadow-lg">
                  <div className="mb-3 flex items-center justify-between">
                    <Badge tone={style.tone}>
                      {style.emoji} {a.category}
                    </Badge>
                  </div>
                  <h3 className="font-semibold leading-snug group-hover:text-brand-700">{a.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-500">{a.summary}</p>
                  <span className="mt-4 inline-block text-sm font-semibold text-brand-600">Czytaj →</span>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
