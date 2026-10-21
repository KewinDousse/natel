/**
 * The edit form's state: the draft of a contact and the actions the fields
 * dispatch. Pure, so the page and its tests share it.
 */

import type { PhotoEdit } from "@/model/contact";
import { addressTypesOf } from "@/vcard";
import {
  type AddressKind,
  appleBuiltInOf,
  type ContactDraft,
  type DraftAddress,
  type FieldKind,
  newDraftAddress,
  nextId,
  withKind,
} from "./contact-edit";

/** The parts of an address the form edits. */
export type AddressPart = "extended" | "street" | "postalCode" | "locality" | "country";

export type DraftAction =
  | { type: "REBUILD"; draft: ContactDraft }
  | { type: "ADD_TEL" }
  | { type: "ADD_EMAIL" }
  | { type: "SET_FAMILY"; value: string }
  | { type: "SET_GIVEN"; value: string }
  | { type: "SET_TEL"; index: number; value: string }
  | { type: "SET_TEL_TYPE"; index: number; value: FieldKind }
  | { type: "REMOVE_TEL"; index: number }
  | { type: "SET_EMAIL"; index: number; value: string }
  | { type: "SET_EMAIL_TYPE"; index: number; value: FieldKind }
  | { type: "REMOVE_EMAIL"; index: number }
  | { type: "SET_NICKNAME"; value: string }
  | { type: "SET_ADR_TYPE"; index: number; value: AddressKind }
  | { type: "SET_ADR_PART"; index: number; part: AddressPart; value: string }
  | { type: "SET_ADR_LABEL"; index: number; value: string }
  | { type: "REMOVE_ADR"; index: number }
  | { type: "ADD_ADR" }
  | { type: "SET_BDAY_YEAR"; value: string }
  | { type: "SET_BDAY_MONTH"; value: string }
  | { type: "SET_BDAY_DAY"; value: string }
  | { type: "ADD_BDAY" }
  | { type: "SET_ORG"; value: string }
  | { type: "SET_TITLE"; value: string }
  | { type: "SET_URL"; value: string }
  | { type: "SET_URL_TYPE"; value: FieldKind }
  | { type: "SET_NOTE"; value: string }
  | { type: "SET_PHOTO"; value: PhotoEdit };

export function draftReducer(state: ContactDraft, action: DraftAction): ContactDraft {
  switch (action.type) {
    case "REBUILD":
      return { ...action.draft };
    case "ADD_TEL":
      return {
        ...state,
        tel: [...state.tel, { id: nextId(), value: "", type: "", _orig: { value: "" } }],
      };
    case "ADD_EMAIL":
      return {
        ...state,
        email: [...state.email, { id: nextId(), value: "", type: "", _orig: { value: "" } }],
      };
    case "SET_FAMILY":
      return { ...state, family: action.value };
    case "SET_GIVEN":
      return { ...state, given: action.value };
    case "SET_TEL": {
      const tel = [...state.tel];
      const item = tel[action.index];
      if (item) tel[action.index] = { ...item, value: action.value };
      return { ...state, tel };
    }
    case "SET_TEL_TYPE": {
      const tel = [...state.tel];
      const item = tel[action.index];
      if (item) tel[action.index] = { ...item, type: action.value };
      return { ...state, tel };
    }
    case "REMOVE_TEL": {
      return { ...state, tel: state.tel.filter((_, i) => i !== action.index) };
    }
    case "SET_EMAIL": {
      const email = [...state.email];
      const item = email[action.index];
      if (item) email[action.index] = { ...item, value: action.value };
      return { ...state, email };
    }
    case "SET_EMAIL_TYPE": {
      const email = [...state.email];
      const item = email[action.index];
      if (item) email[action.index] = { ...item, type: action.value };
      return { ...state, email };
    }
    case "REMOVE_EMAIL": {
      return { ...state, email: state.email.filter((_, i) => i !== action.index) };
    }
    case "SET_NICKNAME":
      return { ...state, nickname: action.value };
    case "SET_ADR_TYPE":
      return withAddress(state, action.index, (adr) => {
        if (action.value === "custom") {
          return { ...adr, customLabel: customLabelOf(adr.label), dropLabel: undefined };
        }
        if (action.value === "label") {
          return {
            ...adr,
            // The label goes with the TYPE it was read with.
            type: adr.source === undefined ? adr.type : addressTypesOf(adr.source.params),
            customLabel: undefined,
            dropLabel: undefined,
          };
        }
        return {
          ...adr,
          type: withKind(adr.type, action.value),
          customLabel: undefined,
          dropLabel: adr.label === undefined ? undefined : true,
        };
      });
    case "SET_ADR_PART":
      return withAddress(state, action.index, (adr) => ({ ...adr, [action.part]: action.value }));
    case "SET_ADR_LABEL":
      return withAddress(state, action.index, (adr) => ({ ...adr, customLabel: action.value }));
    case "REMOVE_ADR":
      return { ...state, adr: state.adr.filter((_, i) => i !== action.index) };
    case "ADD_ADR":
      return { ...state, adr: [...state.adr, newDraftAddress()] };
    case "SET_BDAY_YEAR":
      return { ...state, bday: state.bday ? { ...state.bday, year: action.value } : null };
    case "SET_BDAY_MONTH":
      return { ...state, bday: state.bday ? { ...state.bday, month: action.value } : null };
    case "SET_BDAY_DAY":
      return { ...state, bday: state.bday ? { ...state.bday, day: action.value } : null };
    case "ADD_BDAY":
      if (state.bday) return state;
      return {
        ...state,
        bday: { source: "", year: "", month: "", day: "" },
      };
    case "SET_ORG":
      return { ...state, org: action.value };
    case "SET_TITLE":
      return { ...state, title: action.value };
    case "SET_URL":
      return { ...state, url: action.value };
    case "SET_URL_TYPE":
      return { ...state, urlType: action.value };
    case "SET_NOTE":
      return { ...state, note: action.value };
    case "SET_PHOTO":
      return { ...state, photo: action.value };
  }
}

function withAddress(
  state: ContactDraft,
  index: number,
  change: (adr: DraftAddress) => DraftAddress,
): ContactDraft {
  const adr = [...state.adr];
  const item = adr[index];
  if (item) adr[index] = change(item);
  return { ...state, adr };
}

/** A card's label to start a custom one from; Apple's built-in ones are its own types. */
function customLabelOf(label: string | undefined): string {
  return label === undefined || appleBuiltInOf(label) !== undefined ? "" : label;
}
