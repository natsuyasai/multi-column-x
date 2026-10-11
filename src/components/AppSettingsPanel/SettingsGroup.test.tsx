import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SettingsGroup } from "./SettingsGroup";

describe("SettingsGroup", () => {
  it("子要素があれば大見出し(h2)と子要素が表示される", () => {
    render(
      <SettingsGroup title="表示">
        <p>子要素</p>
      </SettingsGroup>,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "表示" }),
    ).toBeInTheDocument();
    expect(screen.getByText("子要素")).toBeInTheDocument();
  });

  it("子要素が false / null のみのグループは大見出しも表示されない", () => {
    const { container } = render(
      <SettingsGroup title="表示">
        {false}
        {null}
      </SettingsGroup>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("子要素が未指定のグループは何も描画されない", () => {
    const { container } = render(<SettingsGroup title="表示" />);
    expect(container).toBeEmptyDOMElement();
  });
});
