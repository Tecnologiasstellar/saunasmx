import { serviceLabel } from '../marketplace-config/labels';
import type { PublicProvider } from '../provider/public-queries';
import { Badge, ButtonLink, Card, Chip } from './primitives';

/**
 * Verified Supplier Card.
 *
 * Everything rendered here is a column the provider filled in for this
 * marketplace. The badge appears only when the operator verified the provider,
 * and the CTA goes to the questionnaire — the only path where consent is
 * captured before anyone is contacted. There is no direct-contact affordance
 * because there is no direct-contact feature.
 */

/** "CDMX · CP 01, 03, 05" — the provider's own declared coverage, nothing more. */
export function coverageLine(provider: Pick<PublicProvider, 'regionCodes' | 'postalPrefixes'>): string {
  const parts: string[] = [];
  if (provider.regionCodes.length > 0) parts.push(provider.regionCodes.join(' / '));
  if (provider.postalPrefixes.length > 0) parts.push(`CP ${provider.postalPrefixes.join(', ')}`);
  return parts.length > 0 ? `Cobertura declarada: ${parts.join(' · ')}` : 'Cobertura por confirmar';
}

export function SupplierCard({
  provider,
  serviceLabels,
  compact = false,
}: {
  provider: PublicProvider;
  serviceLabels: Record<string, string>;
  compact?: boolean;
}) {
  return (
    <Card hover className="flex h-full flex-col gap-4">
      <div
        className="placeholder-logo h-16 w-16 rounded-[var(--radius)]"
        role="img"
        aria-label={`${provider.displayName} aún no ha subido su logotipo`}
      />

      {provider.verified ? <Badge>Proveedor verificado</Badge> : null}

      <h3 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-[var(--ink)]">
        {provider.displayName}
      </h3>

      <p className="text-[0.8125rem] text-[var(--ink-subtle)]">{coverageLine(provider)}</p>

      {!compact && provider.description ? (
        <p className="text-sm leading-relaxed text-[var(--ink-muted)]">{provider.description}</p>
      ) : null}

      {!compact && provider.serviceKeys.length > 0 ? (
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {provider.serviceKeys.map((key) => (
            <li key={key}>
              <Chip>{serviceLabel(serviceLabels, key)}</Chip>
            </li>
          ))}
        </ul>
      ) : null}

      <ButtonLink
        href="/cotizar"
        variant="outline"
        className="mt-auto w-full py-3"
        aria-label={`Solicitar cotización para un proyecto que ${provider.displayName} pueda atender`}
      >
        Solicitar cotización
      </ButtonLink>
    </Card>
  );
}
