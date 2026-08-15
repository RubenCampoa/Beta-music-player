#pragma once

#include <QAbstractListModel>
#include <QJsonArray>
#include <QJsonObject>

// A small, typed QML-facing adapter around the provider-neutral JSON objects
// used by the service layer.  The legacy JSON string properties remain
// available during the UI migration, while new QML code can bind directly to
// roles without reparsing the entire list on every signal.
class JsonListModel final : public QAbstractListModel
{
    Q_OBJECT
    Q_PROPERTY(int count READ count NOTIFY countChanged)

public:
    enum Role {
        ItemRole = Qt::UserRole + 1,
        IdRole,
        PlatformIdRole,
        NameRole,
        ArtistRole,
        AlbumRole,
        CoverRole,
        DurationRole,
        SourceRole,
        VipRole,
        LikedRole,
        DescriptionRole,
        CountRole,
        TimeRole,
        TranslationRole,
        WordsRole
    };

    explicit JsonListModel(QObject *parent = nullptr);

    int rowCount(const QModelIndex &parent = {}) const override;
    int count() const { return m_items.size(); }
    Q_INVOKABLE QVariantMap get(int row) const;
    QVariant data(const QModelIndex &index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;

    void setItems(const QJsonArray &items);
    const QJsonArray &items() const { return m_items; }

private:
    QJsonArray m_items;

signals:
    void countChanged();
};
