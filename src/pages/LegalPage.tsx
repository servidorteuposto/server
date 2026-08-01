import {
  LEGAL_CONTROLLER,
  LEGAL_DOCUMENTS,
  getLegalDocument,
  type LegalDocId,
} from '../config/legal'
import './LegalPage.css'

type LegalPageProps = {
  docId: LegalDocId
}

export default function LegalPage({ docId }: LegalPageProps) {
  const document = getLegalDocument(docId)

  if (!document) {
    return (
      <div className="legal-page">
        <div className="legal-page__card">
          <h1>Documento não encontrado</h1>
          <p>
            <a href="/">Voltar ao início</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="legal-page">
      <header className="legal-page__top">
        <a href="/" className="legal-page__brand" aria-label="Voltar ao Teu Posto">
          <img
            src="/imagens/logo_teuposto.png"
            alt="Teu Posto"
            className="legal-page__logo"
          />
        </a>
        <nav className="legal-page__nav" aria-label="Documentos legais">
          {LEGAL_DOCUMENTS.map((doc) => (
            <a
              key={doc.id}
              href={`/legal/${doc.id}`}
              className="legal-page__nav-link"
              data-active={doc.id === document.id}
            >
              {doc.shortTitle}
            </a>
          ))}
        </nav>
      </header>

      <article className="legal-page__card">
        <p className="legal-page__meta">Atualizado em {document.updatedAt}</p>
        <h1>{document.title}</h1>
        <p className="legal-page__intro">{document.intro}</p>

        {document.sections.map((section) => (
          <section key={section.title} className="legal-page__section">
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph, index) => (
              <p key={`${section.title}-${index}`}>{paragraph}</p>
            ))}
            {section.bullets && section.bullets.length > 0 && (
              <ul>
                {section.bullets.map((item, index) => (
                  <li key={`${section.title}-b-${index}`}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <footer className="legal-page__footer">
          <p>
            {LEGAL_CONTROLLER.brand} · {LEGAL_CONTROLLER.siteUrl.replace('https://', '')}
          </p>
          <p>
            Contato de privacidade:{' '}
            <a href={LEGAL_CONTROLLER.supportUrl}>abrir formulário de suporte</a>
            {' · '}
            <a href={`mailto:${LEGAL_CONTROLLER.supportEmail}`}>{LEGAL_CONTROLLER.supportEmail}</a>
          </p>
          <p>
            <a href="/">Voltar ao aplicativo</a>
          </p>
        </footer>
      </article>
    </div>
  )
}
