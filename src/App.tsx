import { useEffect, useRef, useState, useId } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { A11y, Keyboard, Navigation, Pagination } from "swiper/modules";
import ExportNewsButton from "./components/ExportNewsButton";
import { readServerSentEvents } from "./parseSse";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "./styles.css";

type Category = "latest" | "headlines";

type News = {
  id: string;
  title: string;
  subtitle: string | null;
  date: string;
  keywords: string[];
  paragraphs: [string | null, string | null, string | null];
  sourceUrl: string;
  sourceName: string;
  imageUrl: string | null;
  hasSourceText: boolean;
};

type ItemError = {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  message: string;
};

type Slide =
  | { type: "item"; article: News }
  | { type: "error"; failure: ItemError };

type StreamProgress = {
  completed: number;
  total: number | null;
};

const categories: Record<Category, string> = {
  latest: "Últimas de tecnologia",
  headlines: "Destaques de tecnologia",
};

const categoryDescriptions: Record<Category, string> = {
  latest:
    "Notícias sobre tecnologia, ordenadas da mais recente para a mais antiga.",
  headlines:
    "Manchetes da categoria de tecnologia selecionadas pela GNews.",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeStyle: "short",
});

function NewsImage({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="news-card__media" aria-hidden="true">
      {src && !failed && (
        <img
          className="news-card__image"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

const quantityOptions = [1, 5, 10];

function isNews(value: unknown): value is News {
  if (!value || typeof value !== "object") return false;

  const article = value as News;

  return (
    typeof article.id === "string" &&
    typeof article.title === "string" &&
    typeof article.sourceUrl === "string" &&
    typeof article.sourceName === "string" &&
    typeof article.date === "string" &&
    typeof article.hasSourceText === "boolean" &&
    (article.subtitle === null || typeof article.subtitle === "string") &&
    (article.imageUrl === null || typeof article.imageUrl === "string") &&
    Array.isArray(article.keywords) &&
    Array.isArray(article.paragraphs) &&
    article.paragraphs.length === 3
  );
}

function isItemError(value: unknown): value is ItemError {
  if (!value || typeof value !== "object") return false;

  const item = value as ItemError;

  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.sourceName === "string" &&
    typeof item.sourceUrl === "string" &&
    typeof item.message === "string"
  );
}

function isMeta(
  value: unknown,
): value is { total: number; requested: number } {
  if (!value || typeof value !== "object") return false;

  const meta = value as { total: unknown; requested: unknown };

  return typeof meta.total === "number" && typeof meta.requested === "number";
}

function isDone(
  value: unknown,
): value is { delivered: number; failed: number } {
  if (!value || typeof value !== "object") return false;

  const done = value as { delivered: unknown; failed: unknown };

  return (
    typeof done.delivered === "number" && typeof done.failed === "number"
  );
}

function progressMessage(progress: StreamProgress): string {
  if (progress.total === null) {
    return "Consultando a GNews e preparando os resumos com llama3.1.";
  }

  if (progress.total === 0) {
    return "Nenhuma publicação encontrada nesta consulta.";
  }

  if (progress.completed === 0) {
    return `Gerando o resumo 1 de ${progress.total}.`;
  }

  return `Resumo ${progress.completed} de ${progress.total}.`;
}

type QuantitySelectProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

function QuantitySelect({
  value,
  onChange,
  disabled = false,
}: QuantitySelectProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = Math.max(0, quantityOptions.indexOf(value));

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      optionRefs.current[selectedIndex]?.focus();
    }
  }, [open, selectedIndex]);

  function closeAndFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function selectOption(option: number) {
    onChange(option);
    closeAndFocus();
  }

  return (
    <div
      className="custom-select"
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <span id={`${id}-label`} className="custom-select__label">
        Quantidade de notícias
      </span>

      <button
        ref={triggerRef}
        id={`${id}-trigger`}
        type="button"
        className="custom-select__trigger"
        disabled={disabled}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }

          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <span id={`${id}-value`}>
          {value} {value === 1 ? "notícia" : "notícias"}
        </span>

        <span
          className={`custom-select__chevron ${open ? "is-open" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          id={`${id}-listbox`}
          className="custom-select__dropdown"
          role="listbox"
          aria-labelledby={`${id}-label`}
        >
          {quantityOptions.map((option, index) => (
            <button
              key={option}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="option"
              aria-selected={value === option}
              tabIndex={-1}
              className="custom-select__option"
              onClick={() => selectOption(option)}
              onKeyDown={(event) => {
                let targetIndex: number | undefined;

                switch (event.key) {
                  case "ArrowDown":
                    targetIndex = (index + 1) % quantityOptions.length;
                    break;

                  case "ArrowUp":
                    targetIndex =
                      (index - 1 + quantityOptions.length) %
                      quantityOptions.length;
                    break;

                  case "Home":
                    targetIndex = 0;
                    break;

                  case "End":
                    targetIndex = quantityOptions.length - 1;
                    break;

                  case "Escape":
                    event.preventDefault();
                    closeAndFocus();
                    return;

                  case "Tab":
                    // Retorna ao botão antes da navegação padrão por Tab.
                    setOpen(false);
                    triggerRef.current?.focus();
                    return;
                }

                if (targetIndex !== undefined) {
                  event.preventDefault();
                  optionRefs.current[targetIndex]?.focus();
                }
              }}
            >
              <span>
                {option} {option === 1 ? "notícia" : "notícias"}
              </span>

              {value === option && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [category, setCategory] = useState<Category | null>(null);
  const [count, setCount] = useState(5);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [progress, setProgress] = useState<StreamProgress>({
    completed: 0,
    total: null,
  });
  const [screen, setScreen] = useState<"settings" | "news">("settings");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const controllerRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const successfulNews = slides.flatMap((slide) =>
    slide.type === "item" ? [slide.article] : [],
  );
  const hasItemError = slides.some((slide) => slide.type === "error");

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [screen]);

  function leaveNews() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setScreen("settings");
    setLoading(false);
    setError("");
  }

  async function loadNews() {
    if (!category || loading) return;

    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    // Abre imediatamente a tela de notícias na mesma guia.
    setScreen("news");
    setSlides([]);
    setProgress({ completed: 0, total: null });
    setError("");
    setLoading(true);

    try {
      const params = new URLSearchParams({
        category,
        count: String(count),
      });

      const response = await fetch(`/api/news?${params}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = "Não foi possível contactar o backend.";

        try {
          const result = (await response.json()) as { error?: unknown };

          if (typeof result.error === "string" && result.error) {
            message = result.error;
          }
        } catch {
          message = "Não foi possível contactar o backend.";
        }

        throw new Error(message);
      }

      const contentType = response.headers.get("content-type") ?? "";

      if (!contentType.includes("text/event-stream") || !response.body) {
        throw new Error("O backend não enviou o fluxo de notícias.");
      }

      let receivedDone = false;

      for await (const event of readServerSentEvents(
        response.body,
        controller.signal,
      )) {
        if (controller.signal.aborted) return;

        let payload: unknown;

        try {
          payload = JSON.parse(event.data);
        } catch {
          continue;
        }

        if (event.event === "meta" && isMeta(payload)) {
          setProgress({ completed: 0, total: payload.total });
          continue;
        }

        if (event.event === "item" && isNews(payload)) {
          setSlides((current) => [
            ...current,
            { type: "item", article: payload },
          ]);
          setProgress((current) => ({
            total: current.total,
            completed: current.completed + 1,
          }));
          continue;
        }

        if (event.event === "item-error" && isItemError(payload)) {
          setSlides((current) => [
            ...current,
            { type: "error", failure: payload },
          ]);
          setProgress((current) => ({
            total: current.total,
            completed: current.completed + 1,
          }));
          continue;
        }

        if (event.event === "done" && isDone(payload)) {
          receivedDone = true;

          if (payload.delivered === 0 && payload.failed === 0) {
            setError("Nenhuma notícia disponível nesta consulta.");
          }
        }
      }

      if (!receivedDone && !controller.signal.aborted) {
        setError("A conexão com o backend foi interrompida.");
      }
    } catch (caught) {
      if (controller.signal.aborted) return;

      if (caught instanceof TypeError) {
        setError("Não foi possível contactar o backend.");
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : "Ocorreu um erro inesperado.",
      );
    } finally {
      if (controllerRef.current === controller) {
        setLoading(false);
      }
    }
  }

  if (screen === "news" && category) {
    return (
      <main className="app-shell">
        <div className="content-shell">
          <header className="page-header news-page-header">
            <button
              type="button"
              className="back-arrow"
              onClick={leaveNews}
              aria-label="Voltar às opções"
              title="Voltar às opções"
            >
              <span aria-hidden="true">←</span>
            </button>

            {!loading && successfulNews.length > 0 && (
              <ExportNewsButton news={successfulNews} />
            )}

            <h1 ref={headingRef} tabIndex={-1} className="sr-only">
              Notícias de tecnologia
            </h1>
          </header>

          {loading && slides.length === 0 && (
            <section
              className="feedback-panel loading-panel"
              aria-labelledby="loading-title"
              aria-busy="true"
            >
              <span className="loading-spinner" aria-hidden="true" />

              <h2 id="loading-title">Preparando suas notícias</h2>

              <p role="status">
                {progressMessage(progress)}
                <br />
                Isso pode levar alguns minutos.
              </p>
            </section>
          )}

          {loading && slides.length > 0 && (
            <p className="notice stream-status" role="status">
              {progressMessage(progress)}
            </p>
          )}

          {!loading &&
            !error &&
            progress.total !== null &&
            progress.total < count &&
            slides.length > 0 && (
              <p className="notice stream-status" role="status">
                Foram encontradas menos publicações válidas que o solicitado.
              </p>
            )}

          {!loading && error && slides.length === 0 && (
            <section className="feedback-panel" aria-labelledby="error-title">
              <h2 id="error-title">Não foi possível carregar as notícias</h2>

              <p className="error-message" role="alert">
                {error}
              </p>

              <button
                type="button"
                className="button button--primary"
                onClick={() => void loadNews()}
              >
                Tentar novamente
              </button>
            </section>
          )}

          {!loading && error && slides.length > 0 && (
            <p className="error-message stream-status" role="alert">
              {error}
            </p>
          )}

          {!loading && hasItemError && (
            <div className="form-actions stream-status">
              <button
                type="button"
                className="button button--primary"
                onClick={() => void loadNews()}
              >
                Tentar novamente
              </button>
            </div>
          )}

          {slides.length > 0 && (
            <section className="news-section" aria-label="Carrossel de notícias">
              <Swiper
                className="news-swiper"
                modules={[Navigation, Pagination, Keyboard, A11y]}
                slidesPerView={1}
                spaceBetween={32}
                navigation
                pagination={{ clickable: true }}
                keyboard={{ enabled: true, onlyInViewport: true }}
                autoHeight
                watchOverflow
                observer
                observeParents
                a11y={{
                  prevSlideMessage: "Notícia anterior",
                  nextSlideMessage: "Próxima notícia",
                  firstSlideMessage: "Esta é a primeira notícia",
                  lastSlideMessage: "Esta é a última notícia",
                  paginationBulletMessage: "Ir para a notícia {{index}}",
                }}
              >
                {slides.map((slide) => {
                  if (slide.type === "error") {
                    return (
                    <SwiperSlide key={slide.failure.id}>
                      <article
                        className="news-card"
                        aria-labelledby={`title-${slide.failure.id}`}
                      >
                        <div className="news-card__content">
                          <header className="news-card__header">
                            <p className="news-date">{slide.failure.sourceName}</p>

                            <h2 id={`title-${slide.failure.id}`}>
                              {slide.failure.title}
                            </h2>
                          </header>

                          <p className="error-message" role="alert">
                            {slide.failure.message}
                          </p>

                          <footer className="news-footer">
                            <div className="news-links">
                              <a
                                className="text-link"
                                href={slide.failure.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Ler publicação original
                                <span aria-hidden="true"> ↗</span>
                              </a>
                            </div>
                          </footer>
                        </div>

                        <NewsImage src={null} />
                      </article>
                    </SwiperSlide>
                    );
                  }

                  const article = slide.article;

                  return (
                  <SwiperSlide key={article.id}>
                    <article
                      className="news-card"
                      aria-labelledby={`title-${article.id}`}
                    >
                      <div className="news-card__content">
                        <header className="news-card__header">
                          <p className="news-date">
                            {article.sourceName} · Publicada em{" "}
                            <time dateTime={article.date}>
                              {dateFormatter.format(new Date(article.date))}
                            </time>
                          </p>

                          <h2 id={`title-${article.id}`}>{article.title}</h2>

                          {article.subtitle && (
                            <p className="news-subtitle">{article.subtitle}</p>
                          )}
                        </header>

                        {article.keywords.length > 0 && (
                          <ul className="tags" aria-label="Palavras-chave">
                            {article.keywords.map((keyword, index) => (
                              <li className="tag" key={`${keyword}-${index}`}>
                                {keyword}
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="news-body">
                          {article.paragraphs[0] && (
                            <p>{article.paragraphs[0]}</p>
                          )}

                          {article.paragraphs[1] && (
                            <p>{article.paragraphs[1]}</p>
                          )}

                          {article.paragraphs[2] && (
                            <div className="main-point">
                              <p>{article.paragraphs[2]}</p>
                            </div>
                          )}
                        </div>

                        {!article.hasSourceText && (
                          <p className="notice">
                            A GNews disponibilizou apenas o título e os dados da publicação.
                            Não foi gerado um resumo da matéria completa.
                          </p>
                        )}

                        {article.hasSourceText &&
                          article.paragraphs.some((paragraph) => !paragraph) && (
                            <p className="notice">
                              O conteúdo disponível não permitiu preencher todas
                              as partes do resumo com segurança.
                            </p>
                          )}

                        <footer className="news-footer">
                          <div className="news-links">
                            <a
                              className="text-link"
                              href={article.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Ler publicação original
                              <span aria-hidden="true"> ↗</span>
                            </a>
                          </div>
                        </footer>
                      </div>

                      <NewsImage
                        key={article.imageUrl ?? "no-image"}
                        src={article.imageUrl}
                      />
                    </article>
                  </SwiperSlide>
                  );
                })}
              </Swiper>
            </section>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="content-shell settings-shell">
       <header className="page-header">
        <h1 ref={headingRef} tabIndex={-1}>
          Tech News - Acompanhe notícias do mundo da tecnologia
        </h1>
        <p>Integrado com a API GNews para exibir notícias atualizadas</p>
      </header>

        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadNews();
          }}
          aria-busy={loading}
        >
          <fieldset className="form-fieldset" disabled={loading}>
            <div className="category-grid">
              {(Object.entries(categories) as [Category, string][]).map(
                ([value, label]) => (
                  <label className="category-option" key={value}>
                    <input
                      type="radio"
                      name="category"
                      value={value}
                      checked={category === value}
                      onChange={() => setCategory(value)}
                      required
                    />

                    <span className="category-card">
                      <span className="category-card__top">
                        <span className="category-card__title">{label}</span>
                        <span
                          className="category-card__indicator"
                          aria-hidden="true"
                        />
                      </span>

                      <span className="category-card__description">
                        {categoryDescriptions[value]}
                      </span>
                    </span>
                  </label>
                ),
              )}
            </div>
          </fieldset>

          {category && (
            <fieldset className="form-fieldset" disabled={loading}>
              <legend className="sr-only">Quantidade de notícias</legend>

              <QuantitySelect
                value={count}
                onChange={setCount}
                disabled={loading}
              />
            </fieldset>
          )}

          <div className="form-actions">
            <button
              className="button button--primary"
              type="submit"
              disabled={!category || loading}
            >
              Explorar notícias
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}