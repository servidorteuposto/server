import type { MenuItem } from '../config/menu'

type ModulePageProps = {
  module: MenuItem
  isReadOnly: boolean
}

export default function ModulePage({ module, isReadOnly }: ModulePageProps) {
  return (
    <section className="module-page">
      <header className="module-page__header">
        <h1>{module.label}</h1>
        <p>{module.description}</p>
      </header>

      <div className="module-page__card">
        {isReadOnly ? (
          <p className="module-page__notice module-page__notice--readonly">
            Modo visualização — este módulo estará disponível para consulta quando implementado.
          </p>
        ) : (
          <p className="module-page__notice">
            Este módulo será implementado em breve. Use o menu lateral para navegar entre as áreas do
            sistema.
          </p>
        )}
      </div>
    </section>
  )
}
