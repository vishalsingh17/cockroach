// Copyright 2021 The Cockroach Authors.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.txt.
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0, included in the file
// licenses/APL.txt.

import React from "react";
import { Link } from "react-router-dom";
import moment from "moment-timezone";
import classnames from "classnames/bind";
import { Button, Icon } from "@cockroachlabs/ui-components";
import { Button as CancelButton } from "src/button";
import { SummaryCard } from "src/summaryCard";
import {
  ActivateDiagnosticsModalRef,
  DiagnosticStatusBadge,
} from "src/statementsDiagnostics";
import emptyListResultsImg from "src/assets/emptyState/empty-list-results.svg";
import { filterByTimeScale, getDiagnosticsStatus } from "./diagnosticsUtils";
import { EmptyTable } from "src/empty";
import styles from "./diagnosticsView.module.scss";
import { getBasePath, StatementDiagnosticsReport } from "../../api";
import { DATE_FORMAT_24_UTC } from "../../util";
import {
  TimeScale,
  timeScale1hMinOptions,
  TimeScaleDropdown,
} from "src/timeScaleDropdown";
import { ColumnDescriptor, SortedTable, SortSetting } from "src/sortedtable";

export interface DiagnosticsViewStateProps {
  hasData: boolean;
  diagnosticsReports: StatementDiagnosticsReport[];
  showDiagnosticsViewLink?: boolean;
  activateDiagnosticsRef: React.RefObject<ActivateDiagnosticsModalRef>;
  currentScale: TimeScale;
}

export interface DiagnosticsViewDispatchProps {
  dismissAlertMessage: () => void;
  onDownloadDiagnosticBundleClick?: (statementFingerprint: string) => void;
  onDiagnosticCancelRequestClick?: (report: StatementDiagnosticsReport) => void;
  onSortingChange?: (
    name: string,
    columnTitle: string,
    ascending: boolean,
  ) => void;
  onChangeTimeScale: (ts: TimeScale) => void;
}

export interface DiagnosticsViewOwnProps {
  statementFingerprint?: string;
}

export type DiagnosticsViewProps = DiagnosticsViewOwnProps &
  DiagnosticsViewStateProps &
  DiagnosticsViewDispatchProps;

interface DiagnosticsViewState {
  sortSetting: SortSetting;
}

const cx = classnames.bind(styles);

const NavButton: React.FC = props => (
  <Button {...props} as="a" intent="tertiary">
    {props.children}
  </Button>
);

export const EmptyDiagnosticsView = ({
  statementFingerprint,
  showDiagnosticsViewLink,
  activateDiagnosticsRef,
}: DiagnosticsViewProps): React.ReactElement => {
  return (
    <EmptyTable
      icon={emptyListResultsImg}
      title="Activate statement diagnostics"
      footer={
        <footer className={cx("empty-view__footer")}>
          <Button
            intent="primary"
            onClick={() =>
              activateDiagnosticsRef?.current?.showModalFor(
                statementFingerprint,
              )
            }
          >
            Activate Diagnostics
          </Button>
          {showDiagnosticsViewLink && (
            <Link
              component={NavButton}
              to="/reports/statements/diagnosticshistory"
            >
              View all statement diagnostics
            </Link>
          )}
        </footer>
      }
    />
  );
};

export class DiagnosticsView extends React.Component<
  DiagnosticsViewProps,
  DiagnosticsViewState
> {
  constructor(props: DiagnosticsViewProps) {
    super(props);
    this.state = {
      sortSetting: {
        ascending: true,
        columnTitle: "activatedOn",
      },
    };
  }

  columns: ColumnDescriptor<StatementDiagnosticsReport>[] = [
    {
      name: "activatedOn",
      title: "Activated on",
      hideTitleUnderline: true,
      cell: (diagnostic: StatementDiagnosticsReport) =>
        moment.utc(diagnostic.requested_at).format(DATE_FORMAT_24_UTC),
      sort: (diagnostic: StatementDiagnosticsReport) =>
        moment(diagnostic.requested_at)?.unix(),
    },
    {
      name: "status",
      title: "Status",
      hideTitleUnderline: true,
      className: cx("column-size-small"),
      cell: (diagnostic: StatementDiagnosticsReport) => {
        const status = getDiagnosticsStatus(diagnostic);
        return (
          <DiagnosticStatusBadge
            status={status}
            enableTooltip={status !== "READY"}
          />
        );
      },
      sort: (diagnostic: StatementDiagnosticsReport) =>
        String(diagnostic.completed),
    },
    {
      name: "actions",
      title: "",
      hideTitleUnderline: true,
      className: cx("column-size-medium"),
      cell: (diagnostic: StatementDiagnosticsReport) => {
        if (diagnostic.completed) {
          return (
            <div
              className={cx("crl-statements-diagnostics-view__actions-column")}
            >
              <Button
                as="a"
                size="small"
                intent="tertiary"
                href={`${getBasePath()}/_admin/v1/stmtbundle/${
                  diagnostic.statement_diagnostics_id
                }`}
                onClick={() =>
                  this.props.onDownloadDiagnosticBundleClick &&
                  this.props.onDownloadDiagnosticBundleClick(
                    diagnostic.statement_fingerprint,
                  )
                }
                className={cx("download-bundle-button")}
              >
                <Icon iconName="Download" />
                Bundle (.zip)
              </Button>
            </div>
          );
        }
        return (
          <div
            className={cx("crl-statements-diagnostics-view__actions-column")}
          >
            <CancelButton
              size="small"
              type="secondary"
              onClick={() =>
                this.props.onDiagnosticCancelRequestClick &&
                this.props.onDiagnosticCancelRequestClick(diagnostic)
              }
            >
              Cancel request
            </CancelButton>
          </div>
        );
      },
      sort: (diagnostic: StatementDiagnosticsReport) =>
        String(diagnostic.completed),
    },
  ];

  componentWillUnmount(): void {
    this.props.dismissAlertMessage();
  }

  onSortingChange = (ss: SortSetting): void => {
    if (this.props.onSortingChange) {
      this.props.onSortingChange("Diagnostics", ss.columnTitle, ss.ascending);
    }
    this.setState({
      sortSetting: {
        ascending: ss.ascending,
        columnTitle: ss.columnTitle,
      },
    });
  };

  render(): React.ReactElement {
    const {
      hasData,
      diagnosticsReports,
      showDiagnosticsViewLink,
      statementFingerprint,
      activateDiagnosticsRef,
      currentScale,
      onChangeTimeScale,
    } = this.props;

    const readyToRequestDiagnostics = diagnosticsReports.every(
      diagnostic => diagnostic.completed,
    );

    const dataSource = filterByTimeScale(
      diagnosticsReports.map((diagnosticsReport, idx) => ({
        ...diagnosticsReport,
        key: idx,
      })),
      currentScale,
    );

    if (!hasData) {
      return (
        <>
          <TimeScaleDropdown
            options={timeScale1hMinOptions}
            currentScale={currentScale}
            setTimeScale={onChangeTimeScale}
            className={cx("timescale-small", "margin-bottom")}
          />
          <SummaryCard>
            <EmptyDiagnosticsView {...this.props} />
          </SummaryCard>
        </>
      );
    }

    return (
      <>
        <div className={cx("crl-statements-diagnostics-view__header")}>
          <TimeScaleDropdown
            options={timeScale1hMinOptions}
            currentScale={currentScale}
            setTimeScale={onChangeTimeScale}
            className={cx("timescale-small")}
          />
          {readyToRequestDiagnostics && (
            <Button
              onClick={() =>
                activateDiagnosticsRef?.current?.showModalFor(
                  statementFingerprint,
                )
              }
              disabled={!readyToRequestDiagnostics}
              intent="secondary"
            >
              Activate diagnostics
            </Button>
          )}
        </div>
        <SortedTable
          data={dataSource}
          columns={this.columns}
          className={cx("jobs-table")}
          sortSetting={this.state.sortSetting}
          onChangeSortSetting={this.onSortingChange}
          tableWrapperClassName={cx("sorted-table")}
        />
        {showDiagnosticsViewLink && (
          <div className={cx("crl-statements-diagnostics-view__footer")}>
            <Link
              component={NavButton}
              to="/reports/statements/diagnosticshistory"
            >
              All statement diagnostics
            </Link>
          </div>
        )}
      </>
    );
  }
}
