"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { apiFetch, errorMessage } from "../lib/api";
import { toDateInputValue } from "../lib/format";
import type {
  City,
  Employee,
  Permission,
  SessionUser,
} from "../lib/types";
import {
  employeeTypeName,
  type EmployeeTypeSummary,
} from "./employee-lookups";
import {
  Alert,
  Button,
  Field,
  Input,
  Select,
} from "./ui";

function PermissionPicker({
  permissions,
  selected,
  onChange,
}: {
  permissions: Permission[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) {
      return permissions;
    }

    return permissions.filter(
      (permission) =>
        permission.code.toLowerCase().includes(term) ||
        permission.name.toLowerCase().includes(term) ||
        permission.resource.toLowerCase().includes(term),
    );
  }, [permissions, query]);

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  }

  return (
    <div className="stack-sm">
      <Input
        aria-label="Buscar permisos"
        placeholder="Buscar permisos adicionales…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="checkbox-grid">
        {filtered.map((permission) => (
          <label key={permission.id} className="checkbox-row">
            <input
              type="checkbox"
              checked={selected.includes(permission.id)}
              onChange={() => toggle(permission.id)}
            />
            <span>
              <strong>{permission.code}</strong>
              <br />
              <span className="muted text-xs">{permission.name}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="hint">
        Los permisos adicionales se suman a los del rol; no los reemplazan.
      </p>
    </div>
  );
}

export function EmployeeForm({
  mode,
  employee,
  employeeTypes,
  cities,
  employees,
  permissions,
  session,
  canAssignPermissions,
  canChangeRole,
}: {
  mode: "create" | "edit";
  employee?: Employee;
  employeeTypes: EmployeeTypeSummary[];
  cities: City[];
  employees: Employee[];
  permissions: Permission[];
  session: SessionUser;
  canAssignPermissions: boolean;
  canChangeRole: boolean;
}) {
  const router = useRouter();
  const isPartner = session.account_type === "PARTNER";
  const initialTypeId =
    employee?.employee_type_id ?? employeeTypes[0]?.id ?? "";
  const [employeeTypeId, setEmployeeTypeId] = useState(initialTypeId);
  const [firstName, setFirstName] = useState(employee?.first_name ?? "");
  const [lastName, setLastName] = useState(employee?.last_name ?? "");
  const [documentType, setDocumentType] = useState(
    employee?.document_type ?? "CC",
  );
  const [documentNumber, setDocumentNumber] = useState(
    employee?.document_number ?? "",
  );
  const [email, setEmail] = useState(employee?.email ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [jobTitle, setJobTitle] = useState(employee?.job_title ?? "");
  const [hiredAt, setHiredAt] = useState(
    toDateInputValue(employee?.hired_at ?? new Date().toISOString()),
  );
  const [cityIds, setCityIds] = useState<string[]>(employee?.city_ids ?? []);
  const [supervisorId, setSupervisorId] = useState(
    employee?.supervisor_id ??
      (session.account_type === "EMPLOYEE" && session.employee_id
        ? session.employee_id
        : ""),
  );
  const [additionalPermission, setAdditionalPermission] = useState<string[]>(
    employee?.additional_permission ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedType = employeeTypes.find(
    (type) => type.id === employeeTypeId,
  );
  const typeOptions = employeeTypes.some(
    (type) => type.id === employeeTypeId,
  )
    ? employeeTypes
    : employee
      ? [
          ...employeeTypes,
          {
            id: employee.employee_type_id,
            code:
              employee.id === session.employee_id ? "COORDINATOR" : "EMPLEADO",
            name:
              employee.id === session.employee_id ? "COORDINATOR" : "EMPLEADO",
          },
        ]
      : employeeTypes;
  const isSellerTarget = selectedType?.code === "SELLER";
  const coordinatorCandidates = useMemo(() => {
    const coordinatorTypeIds = new Set(
      employeeTypes
        .filter((type) => type.code === "COORDINATOR")
        .map((type) => type.id),
    );

    return employees.filter(
      (item) =>
        item.status === "ACTIVE" && coordinatorTypeIds.has(item.employee_type_id),
    );
  }, [employeeTypes, employees]);

  function toggleCity(id: string) {
    setCityIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConflict(false);
    setSaving(true);

    const common = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim(),
      job_title: jobTitle.trim(),
      city_ids: cityIds,
    };

    try {
      if (mode === "create") {
        const payload: Record<string, unknown> = {
          employee_type_id: employeeTypeId,
          ...common,
          document_type: documentType.trim(),
          document_number: documentNumber.trim(),
          email: email.trim().toLowerCase(),
          hired_at: new Date(`${hiredAt}T00:00:00`).toISOString(),
          supervisor_id:
            isSellerTarget && supervisorId ? supervisorId : null,
        };

        if (canAssignPermissions) {
          payload.additional_permission =
            additionalPermission.length > 0
              ? additionalPermission
              : null;
        }

        const result = await apiFetch<{ employee: Employee }>(
          "/api/employees",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );
        router.push(`/employees/${result.employee.id}`);
        return;
      }

      if (!employee) {
        throw new Error("Employee is missing");
      }

      const payload: Record<string, unknown> = {
        expectedVersion: employee.version,
        ...common,
      };

      if (canAssignPermissions) {
        payload.additional_permission =
          additionalPermission.length > 0 ? additionalPermission : null;
      }

      if (canChangeRole) {
        payload.employee_type_id = employeeTypeId;
        payload.supervisor_id = isSellerTarget
          ? supervisorId || null
          : null;
      }

      await apiFetch<{ employee: Employee }>(`/api/employees/${employee.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      router.refresh();
      window.location.reload();
    } catch (cause) {
      const message = errorMessage(cause);
      if (message.toLowerCase().includes("version") || message.includes("409")) {
        setConflict(true);
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      {error ? (
        <Alert
          tone="error"
          action={
            conflict ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Recargar datos
              </Button>
            ) : undefined
          }
        >
          {error}
          {conflict
            ? " Los datos cambiaron desde que abriste el formulario. Recarga para revisar la versión vigente."
            : ""}
        </Alert>
      ) : null}

      <div className="form-grid">
        <Field label="Nombres" htmlFor="first_name">
          <Input
            id="first_name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
          />
        </Field>
        <Field label="Apellidos" htmlFor="last_name">
          <Input
            id="last_name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            required
          />
        </Field>

        <Field label="Tipo de documento" htmlFor="document_type">
          <Select
            id="document_type"
            value={documentType}
            onChange={(event) => setDocumentType(event.target.value)}
            disabled={mode === "edit"}
            required
          >
            <option value="CC">CC</option>
            <option value="CE">CE</option>
            <option value="NIT">NIT</option>
            <option value="PASSPORT">Pasaporte</option>
          </Select>
        </Field>
        <Field label="Número de documento" htmlFor="document_number">
          <Input
            id="document_number"
            value={documentNumber}
            onChange={(event) => setDocumentNumber(event.target.value)}
            disabled={mode === "edit"}
            required
          />
        </Field>

        <Field
          label="Correo"
          htmlFor="email"
          hint={
            mode === "create"
              ? "El servidor asignará la contraseña inicial de empleado."
              : "El correo se gestiona desde la cuenta de acceso."
          }
        >
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={mode === "edit"}
            required
          />
        </Field>
        <Field label="Teléfono" htmlFor="phone">
          <Input
            id="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
        </Field>

        <Field label="Cargo" htmlFor="job_title">
          <Input
            id="job_title"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
            required
          />
        </Field>
        <Field label="Fecha de ingreso" htmlFor="hired_at">
          <Input
            id="hired_at"
            type="date"
            value={hiredAt}
            onChange={(event) => setHiredAt(event.target.value)}
            disabled={mode === "edit"}
            required
          />
        </Field>

        <Field
          label="Rol"
          htmlFor="employee_type_id"
          hint={
            canChangeRole
              ? "Cambiar a SELLER exige supervisor."
              : "Tu alcance permite gestionar este empleado sin cambiar su rol."
          }
        >
          <Select
            id="employee_type_id"
            value={employeeTypeId}
            onChange={(event) => setEmployeeTypeId(event.target.value)}
            disabled={!canChangeRole || employeeTypes.length <= 1}
            required
          >
            {typeOptions.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} ({type.code})
              </option>
            ))}
          </Select>
        </Field>

        {isSellerTarget ? (
          <Field
            label="Supervisor"
            htmlFor="supervisor_id"
            hint={
              isPartner
                ? "El supervisor debe ser un coordinador activo."
                : "El coordinador que crea al vendedor queda como supervisor."
            }
          >
            {isPartner ? (
              <Select
                id="supervisor_id"
                value={supervisorId}
                onChange={(event) => setSupervisorId(event.target.value)}
                required
              >
                <option value="">Selecciona un coordinador</option>
                {coordinatorCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.first_name} {candidate.last_name}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                value={`${session.display_name} (tú)`}
                disabled
                readOnly
              />
            )}
          </Field>
        ) : null}
      </div>

      <Field label="Ciudades" htmlFor="cities">
        <div className="checkbox-grid" id="cities">
          {cities.length === 0 ? (
            <span className="muted text-sm">No hay ciudades disponibles.</span>
          ) : (
            cities.map((city) => (
              <label key={city.id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={cityIds.includes(city.id)}
                  onChange={() => toggleCity(city.id)}
                />
                <span>
                  {city.name}
                  <br />
                  <span className="muted text-xs">
                    {city.region_code} · {city.country_code}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
      </Field>

      {canAssignPermissions ? (
        <Field
          label="Permisos adicionales"
          htmlFor="additional_permission"
          hint="Se suman a los permisos del rol. No pueden exceder los permisos habilitados del aliado."
        >
          <PermissionPicker
            permissions={permissions}
            selected={additionalPermission}
            onChange={setAdditionalPermission}
          />
        </Field>
      ) : null}

      {mode === "edit" && employee ? (
        <p className="hint">
          Rol actual: {employeeTypeName(employee, employeeTypes, session.employee_id)} ·
          Versión {employee.version}
        </p>
      ) : null}

      <div className="form-actions">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={saving || !employeeTypeId}>
          {saving
            ? "Guardando…"
            : mode === "create"
              ? "Crear empleado"
              : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
